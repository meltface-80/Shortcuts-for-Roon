'use strict';

const { DatabaseSync } = require('node:sqlite');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS webhooks (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL UNIQUE,
  genre       TEXT,
  genre_path  TEXT,
  genres      TEXT,
  album_count INTEGER NOT NULL DEFAULT 1,
  zone_id     TEXT,
  zone_name   TEXT,
  is_preset   INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL
);
`;

/**
 * Add columns introduced after the initial schema to databases created by an
 * older version. node:sqlite runs each statement synchronously; ADD COLUMN is
 * a no-op-safe migration guarded by a table_info check.
 * @param {import('node:sqlite').DatabaseSync} db
 */
function migrate(db) {
  const cols = db.prepare('PRAGMA table_info(webhooks)').all().map((r) => r.name);
  if (!cols.includes('genres')) db.exec('ALTER TABLE webhooks ADD COLUMN genres TEXT');
  if (!cols.includes('album_count')) db.exec('ALTER TABLE webhooks ADD COLUMN album_count INTEGER NOT NULL DEFAULT 1');
}

/**
 * Open a node:sqlite database, enable WAL, and ensure the schema exists.
 * @param {string} dbPath filesystem path or ":memory:"
 * @returns {import('node:sqlite').DatabaseSync}
 */
function openDatabase(dbPath) {
  const db = new DatabaseSync(dbPath);
  initSchema(db);
  return db;
}

/**
 * Apply pragmas + schema. WAL is skipped for in-memory databases (unsupported).
 * @param {import('node:sqlite').DatabaseSync} db
 */
function initSchema(db) {
  try {
    db.exec('PRAGMA journal_mode = WAL;');
  } catch {
    // In-memory databases don't support WAL; ignore.
  }
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec(SCHEMA);
  migrate(db);
  return db;
}

module.exports = { openDatabase, initSchema, migrate };
