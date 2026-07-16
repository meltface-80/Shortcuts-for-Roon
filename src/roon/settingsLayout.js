'use strict';

const { PRESETS, parseGenres, clampCount, MAX_ALBUM_COUNT } = require('../genres');

/**
 * Human-friendly name for a generated webhook.
 * @param {number} count number of albums
 * @param {string|null} label genre label, or null for any genre
 * @returns {string}
 */
function webhookName(count, label) {
  if (count > 1) return label ? `${count} Random ${label} Albums` : `${count} Random Albums`;
  return label ? `Random ${label}` : 'Random Album';
}

/**
 * Normalize a Roon `zone` widget value to a plain id string. Roon may store the
 * widget value as a bare id string OR as a `{ output_id, zone_id, name }` object
 * depending on the build; the rest of the app (and the SQLite bindings) require a
 * string or null.
 * @param {string|object|null|undefined} val
 * @returns {string|null}
 */
function zoneWidgetToId(val) {
  if (!val) return null;
  if (typeof val === 'string') return val;
  if (typeof val === 'object') return val.output_id || val.zone_id || val.id || null;
  return null;
}

/**
 * Build the settings layout object shown in Roon's extension settings.
 * @param {object} settings the current settings `values` object
 * @param {{webhooksRepo:object, config:object, getZones:Function}} ctx
 * @returns {object} a Roon settings layout
 */
function buildLayout(settings, { webhooksRepo, config }) {
  const values = Object.assign({ count: 1 }, settings || {});

  // Existing webhooks listing (plain text — Roon labels can't hyperlink).
  let existing;
  try {
    existing = webhooksRepo.list();
  } catch {
    existing = [];
  }
  const listText = existing.length
    ? existing.map((w) => `• ${w.name}: ${w.url}`).join('\n')
    : 'No webhooks yet.';
  const presetNames = PRESETS.filter((p) => p.genrePath).map((p) => p.label).join(', ');

  return {
    values,
    layout: [
      {
        type: 'group',
        title: 'Create a shortcut webhook',
        items: [
          {
            type: 'string',
            title: 'Genres (comma-separated — leave blank for any genre)',
            setting: 'genres',
          },
          {
            type: 'integer',
            title: 'Number of albums to play',
            setting: 'count',
            min: 1,
            max: MAX_ALBUM_COUNT,
          },
          {
            type: 'zone',
            title: 'Target zone',
            setting: 'defaultZone',
          },
        ],
      },
      {
        type: 'label',
        title:
          `Type one or more genres, e.g. "Metal, Electronic" (each album is drawn ` +
          `from a random one). Presets: ${presetNames}. Leave blank for any genre. ` +
          `Set the count for a multi-album queue, then Save to create the webhook.`,
      },
      {
        type: 'label',
        title: `Dashboard (open in a browser): ${config.PUBLIC_BASE_URL}/`,
      },
      {
        type: 'label',
        title: `Your webhooks:\n${listText}`,
      },
    ],
    has_error: false,
  };
}

/**
 * Create the RoonApiSettings service. `roon` is the RoonApi instance and
 * `RoonApiSettings` is the constructor (injected so tests need not load it).
 *
 * @param {object} roon RoonApi instance (provides save_config/load_config)
 * @param {object} ctx
 * @param {Function} ctx.RoonApiSettings constructor
 * @param {object} ctx.webhooksRepo
 * @param {object} ctx.config
 * @param {Function} ctx.getZones () => zones
 * @param {Function} [ctx.saveConfig] (values) => void
 * @param {Function} [ctx.loadConfig] () => values
 * @param {Function} [ctx.onDefaultZone] (zoneId) => void  called when a zone is chosen
 * @returns {{service:object}} the settings service + handle to update layout
 */
function makeSettingsService(roon, ctx) {
  const {
    RoonApiSettings,
    webhooksRepo,
    config,
    getZones,
    saveConfig,
    loadConfig,
    onDefaultZone,
  } = ctx;

  const load = () => {
    if (typeof loadConfig === 'function') return loadConfig() || {};
    if (roon && typeof roon.load_config === 'function') return roon.load_config('settings') || {};
    return {};
  };
  const persist = (values) => {
    if (typeof saveConfig === 'function') return saveConfig(values);
    if (roon && typeof roon.save_config === 'function') return roon.save_config('settings', values);
    return undefined;
  };

  let svc;

  const getSettings = (cb) => {
    cb(buildLayout(load(), { webhooksRepo, config, getZones }));
  };

  const saveSettings = (req, isDryRun, settings) => {
    const incoming = (settings && settings.values) || {};
    const layout = buildLayout(incoming, { webhooksRepo, config, getZones });
    const hasError = !!layout.has_error;

    req.send_complete(hasError ? 'NotValid' : 'Success', { settings: layout });

    if (isDryRun || hasError) return;

    // Real save: create a webhook when the user configured genres or a
    // multi-album count. ("Any genre, 1 album" already exists as a preset.)
    const genresStr = (incoming.genres || '').trim();
    const count = clampCount(incoming.count);
    const zoneId = zoneWidgetToId(incoming.defaultZone);

    if (genresStr || count > 1) {
      const names = genresStr
        ? genresStr.split(/[,;&\n]+/).map((s) => s.trim()).filter(Boolean)
        : [];
      const label = names.length ? names.join(' & ') : null;
      webhooksRepo.create({
        name: webhookName(count, label),
        genre: label,
        genres: names.length ? parseGenres(names) : null,
        count,
        zoneId,
        zoneName: null,
      });
    }

    // Persist the chosen default zone.
    if (zoneId && typeof onDefaultZone === 'function') {
      onDefaultZone(zoneId);
    }

    // Reset the create fields for the next webhook.
    const nextValues = { ...incoming, genres: '', count: 1 };
    persist(nextValues);
    const nextLayout = buildLayout(nextValues, { webhooksRepo, config, getZones });
    if (svc && typeof svc.update_settings === 'function') {
      svc.update_settings(nextLayout);
    }
  };

  svc = new RoonApiSettings(roon, {
    get_settings: getSettings,
    save_settings: saveSettings,
    button_pressed: () => {},
  });

  return { service: svc, buildLayout: (v) => buildLayout(v, { webhooksRepo, config, getZones }) };
}

module.exports = { makeSettingsService, buildLayout };
