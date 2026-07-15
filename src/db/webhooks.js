'use strict';

const crypto = require('node:crypto');
const { openDatabase } = require('./database');
const { PRESETS } = require('../genres');

/**
 * Turn an arbitrary name into a url-safe slug base.
 * @param {string} name
 * @returns {string}
 */
function slugify(name) {
  const base = String(name || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return base || 'webhook';
}

/**
 * Repository for webhook rows. Converts every row to the camelCase JSON shape
 * documented in the contract, including a computed `url`.
 */
class WebhooksRepo {
  /**
   * @param {{config:{DB_PATH:string,PUBLIC_BASE_URL:string}, db?:import('node:sqlite').DatabaseSync}} opts
   *   Pass an explicit `db` (e.g. ":memory:") for tests; otherwise DB_PATH is opened.
   */
  constructor({ config, db } = {}) {
    if (!config) throw new Error('WebhooksRepo requires a config');
    this.config = config;
    this.db = db || openDatabase(config.DB_PATH);
  }

  /**
   * Build the public JSON shape from a raw DB row.
   * @param {object|null|undefined} row
   */
  toJson(row) {
    if (!row) return null;
    let genrePath = null;
    if (row.genre_path != null) {
      try {
        genrePath = JSON.parse(row.genre_path);
      } catch {
        genrePath = null;
      }
    }
    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      genre: row.genre == null ? null : row.genre,
      genrePath,
      zoneId: row.zone_id == null ? null : row.zone_id,
      zoneName: row.zone_name == null ? null : row.zone_name,
      isPreset: !!row.is_preset,
      createdAt: row.created_at,
      url: `${this.config.PUBLIC_BASE_URL}/w/${row.slug}`,
    };
  }

  /** @returns {object[]} all webhooks (JSON shape), newest first. */
  list() {
    const rows = this.db.prepare('SELECT * FROM webhooks ORDER BY created_at ASC, name ASC').all();
    return rows.map((r) => this.toJson(r));
  }

  /**
   * @param {string} id
   * @returns {object|null}
   */
  get(id) {
    const row = this.db.prepare('SELECT * FROM webhooks WHERE id = ?').get(id);
    return this.toJson(row);
  }

  /**
   * @param {string} slug
   * @returns {object|null}
   */
  getBySlug(slug) {
    const row = this.db.prepare('SELECT * FROM webhooks WHERE slug = ?').get(slug);
    return this.toJson(row);
  }

  /** @returns {boolean} whether a slug is already taken. */
  _slugExists(slug) {
    return !!this.db.prepare('SELECT 1 FROM webhooks WHERE slug = ?').get(slug);
  }

  /** Generate a slug from name that is unique in the table. */
  _uniqueSlug(name) {
    const base = slugify(name);
    if (!this._slugExists(base)) return base;
    let n = 2;
    while (this._slugExists(`${base}-${n}`)) n += 1;
    return `${base}-${n}`;
  }

  /**
   * Insert a new webhook.
   * @param {{name:string, genre?:string|null, genrePath?:(string[][]|null),
   *          zoneId?:string|null, zoneName?:string|null, isPreset?:boolean,
   *          slug?:string, id?:string}} data
   * @returns {object} JSON shape of the created webhook.
   */
  create(data) {
    const {
      name,
      genre = null,
      genrePath = null,
      zoneId = null,
      zoneName = null,
      isPreset = false,
      slug,
      id,
    } = data;
    if (!name || !String(name).trim()) throw new Error('Webhook name is required');

    const rowId = id || crypto.randomUUID().slice(0, 8);
    const rowSlug = slug ? (this._slugExists(slug) ? this._uniqueSlug(slug) : slug) : this._uniqueSlug(name);
    const genrePathJson = genrePath == null ? null : JSON.stringify(genrePath);
    const createdAt = Date.now();

    this.db
      .prepare(
        `INSERT INTO webhooks (id, name, slug, genre, genre_path, zone_id, zone_name, is_preset, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(rowId, String(name), rowSlug, genre, genrePathJson, zoneId, zoneName, isPreset ? 1 : 0, createdAt);

    return this.get(rowId);
  }

  /**
   * Partially update a webhook. Accepts camelCase keys.
   * @param {string} id
   * @param {object} partial
   * @returns {object|null} updated JSON, or null if not found.
   */
  update(id, partial = {}) {
    const existing = this.db.prepare('SELECT * FROM webhooks WHERE id = ?').get(id);
    if (!existing) return null;

    const fields = [];
    const values = [];
    const set = (col, val) => {
      fields.push(`${col} = ?`);
      values.push(val);
    };

    if ('name' in partial && partial.name != null) set('name', String(partial.name));
    if ('slug' in partial && partial.slug != null) {
      const wanted = slugify(partial.slug);
      const finalSlug = wanted === existing.slug ? wanted : (this._slugExists(wanted) ? this._uniqueSlug(wanted) : wanted);
      set('slug', finalSlug);
    }
    if ('genre' in partial) set('genre', partial.genre == null ? null : String(partial.genre));
    if ('genrePath' in partial) set('genre_path', partial.genrePath == null ? null : JSON.stringify(partial.genrePath));
    if ('zoneId' in partial) set('zone_id', partial.zoneId == null ? null : String(partial.zoneId));
    if ('zoneName' in partial) set('zone_name', partial.zoneName == null ? null : String(partial.zoneName));
    if ('isPreset' in partial) set('is_preset', partial.isPreset ? 1 : 0);

    if (fields.length) {
      values.push(id);
      this.db.prepare(`UPDATE webhooks SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    }
    return this.get(id);
  }

  /**
   * Delete a webhook.
   * @param {string} id
   * @returns {boolean} whether a row was removed.
   */
  remove(id) {
    const res = this.db.prepare('DELETE FROM webhooks WHERE id = ?').run(id);
    return res.changes > 0;
  }

  /** @returns {number} total webhook count. */
  count() {
    const row = this.db.prepare('SELECT COUNT(*) AS c FROM webhooks').get();
    return row ? Number(row.c) : 0;
  }

  /**
   * Seed the six presets as webhooks if (and only if) the table is empty.
   * Idempotent.
   * @returns {boolean} whether seeding was performed.
   */
  seedPresets() {
    if (this.count() > 0) return false;
    for (const preset of PRESETS) {
      const name = preset.key === 'any' ? 'Any Album' : `Random ${preset.label}`;
      const slug = preset.key === 'any' ? 'any-album' : `random-${preset.key}`;
      this.create({
        name,
        genre: preset.genrePath ? preset.label : null,
        genrePath: preset.genrePath,
        zoneId: null,
        zoneName: null,
        isPreset: true,
        slug,
      });
    }
    return true;
  }
}

module.exports = { WebhooksRepo, slugify };
