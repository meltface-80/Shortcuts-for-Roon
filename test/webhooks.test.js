'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { DatabaseSync } = require('node:sqlite');
const { initSchema } = require('../src/db/database');
const { WebhooksRepo } = require('../src/db/webhooks');

const CONFIG = { DB_PATH: ':memory:', PUBLIC_BASE_URL: 'http://example.test:3000' };

function makeRepo() {
  const db = initSchema(new DatabaseSync(':memory:'));
  return new WebhooksRepo({ config: CONFIG, db });
}

test('create/get/list/getBySlug roundtrip with JSON shape + url', () => {
  const repo = makeRepo();
  const created = repo.create({ name: 'Random Jazz', genre: 'Jazz', genrePath: [['Jazz']] });
  assert.strictEqual(created.name, 'Random Jazz');
  assert.strictEqual(created.slug, 'random-jazz');
  assert.strictEqual(created.genre, 'Jazz');
  assert.deepStrictEqual(created.genrePath, [['Jazz']]);
  assert.strictEqual(created.isPreset, false);
  assert.strictEqual(created.url, 'http://example.test:3000/w/random-jazz');
  assert.strictEqual(typeof created.createdAt, 'number');

  const fetched = repo.get(created.id);
  assert.deepStrictEqual(fetched, created);

  const bySlug = repo.getBySlug('random-jazz');
  assert.strictEqual(bySlug.id, created.id);

  const list = repo.list();
  assert.strictEqual(list.length, 1);
});

test('unique slug generation avoids collisions', () => {
  const repo = makeRepo();
  const a = repo.create({ name: 'My Mix' });
  const b = repo.create({ name: 'My Mix' });
  const c = repo.create({ name: 'My Mix' });
  assert.strictEqual(a.slug, 'my-mix');
  assert.strictEqual(b.slug, 'my-mix-2');
  assert.strictEqual(c.slug, 'my-mix-3');
});

test('update mutates fields and returns new JSON', () => {
  const repo = makeRepo();
  const w = repo.create({ name: 'Original', genre: null });
  const updated = repo.update(w.id, { name: 'Renamed', genre: 'Rock', zoneId: 'zone-9' });
  assert.strictEqual(updated.name, 'Renamed');
  assert.strictEqual(updated.genre, 'Rock');
  assert.strictEqual(updated.zoneId, 'zone-9');
  assert.strictEqual(repo.update('missing', { name: 'x' }), null);
});

test('remove deletes a webhook', () => {
  const repo = makeRepo();
  const w = repo.create({ name: 'Temp' });
  assert.strictEqual(repo.remove(w.id), true);
  assert.strictEqual(repo.get(w.id), null);
  assert.strictEqual(repo.remove(w.id), false);
});

test('seedPresets inserts six presets and is idempotent', () => {
  const repo = makeRepo();
  assert.strictEqual(repo.seedPresets(), true);
  assert.strictEqual(repo.count(), 6);

  const seededAgain = repo.seedPresets();
  assert.strictEqual(seededAgain, false);
  assert.strictEqual(repo.count(), 6);

  const list = repo.list();
  const slugs = list.map((w) => w.slug).sort();
  assert.ok(slugs.includes('any-album'));
  assert.ok(slugs.includes('random-jazz'));
  assert.ok(list.every((w) => w.isPreset === true));

  const any = repo.getBySlug('any-album');
  assert.strictEqual(any.genre, null);
  assert.strictEqual(any.genrePath, null);

  const jazz = repo.getBySlug('random-jazz');
  assert.deepStrictEqual(jazz.genrePath, [['Jazz']]);
  assert.strictEqual(jazz.genre, 'Jazz');
});
