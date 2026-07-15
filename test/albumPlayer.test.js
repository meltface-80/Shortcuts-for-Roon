'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const {
  playRandomAlbum,
  playByGenrePathCandidates,
  resolveZone,
} = require('../src/roon/albumPlayer');
const { createFakeRoonManager, buildDefaultTree } = require('./helpers/fakeRoon');

test('any-album plays and returns an album title', async () => {
  const roonManager = createFakeRoonManager();
  const result = await playRandomAlbum({ roonManager, genrePath: null, zoneId: 'zone-1' });
  assert.match(result.album, /^Library Album \d+$/);
  assert.strictEqual(result.zoneId, 'zone-1');
  assert.strictEqual(result.zoneName, 'Living Room');
  assert.strictEqual(roonManager._plays.length, 1);
});

test('jazz genre plays a jazz album', async () => {
  const roonManager = createFakeRoonManager();
  const result = await playRandomAlbum({ roonManager, genrePath: ['Jazz'], zoneId: 'zone-1' });
  assert.match(result.album, /^Jazz Album \d+$/);
  assert.strictEqual(roonManager._plays.length, 1);
});

test('trip-hop via candidate ["Electronic","Trip-Hop"] plays', async () => {
  const roonManager = createFakeRoonManager();
  const result = await playByGenrePathCandidates({
    roonManager,
    candidates: [['Trip-Hop'], ['Electronic', 'Trip-Hop']],
    zoneId: 'zone-1',
  });
  // First candidate ["Trip-Hop"] does not exist at the top Genres level, so the
  // second candidate (drill through Electronic) must be used.
  assert.match(result.album, /^Trip-Hop Album \d+$/);
});

test('unknown genre throws a clear error', async () => {
  const roonManager = createFakeRoonManager();
  await assert.rejects(
    () => playRandomAlbum({ roonManager, genrePath: ['Bluegrass'], zoneId: 'zone-1' }),
    /Genre "Bluegrass" not found in your library/
  );
});

test('empty album list throws', async () => {
  const roonManager = createFakeRoonManager({ tree: buildDefaultTree({ albums: 0 }) });
  await assert.rejects(
    () => playRandomAlbum({ roonManager, genrePath: null, zoneId: 'zone-1' }),
    /No albums found/
  );
});

test('final Play Now browse receives the correct zone_or_output_id', async () => {
  const roonManager = createFakeRoonManager();
  await playRandomAlbum({ roonManager, genrePath: null, zoneId: 'zone-2' });
  assert.strictEqual(roonManager._plays.length, 1);
  assert.strictEqual(roonManager._plays[0].zoneId, 'zone-2');
  // The recorded play node is a "Play Now" leaf.
  assert.strictEqual(roonManager._plays[0].node.isPlayNow, true);
});

test('a random offset within range is used for album selection', async () => {
  const roonManager = createFakeRoonManager(); // Library has 5 albums
  await playRandomAlbum({ roonManager, genrePath: null, zoneId: 'zone-1' });
  const albumLoad = roonManager._calls.load.find((c) => c.count === 1);
  assert.ok(albumLoad, 'expected a count:1 load for the random album');
  assert.ok(albumLoad.offset >= 0 && albumLoad.offset < 5, `offset ${albumLoad.offset} in [0,5)`);
});

test('resolveZone falls back to the default zone id', () => {
  const roonManager = createFakeRoonManager({ defaultZoneId: 'zone-2' });
  const r = resolveZone(roonManager, null);
  assert.strictEqual(r.zoneId, 'zone-2');
  assert.strictEqual(r.zoneName, 'Kitchen');
});

test('throws when no zone is available', async () => {
  const roonManager = createFakeRoonManager({ zones: [], defaultZoneId: null });
  await assert.rejects(
    () => playRandomAlbum({ roonManager, genrePath: null, zoneId: null }),
    /No Roon zone available/
  );
});

test('every browse/load carries a multi_session_key and it is unique per call', async () => {
  const roonManager = createFakeRoonManager();
  await playRandomAlbum({ roonManager, genrePath: null, zoneId: 'zone-1' });
  const keys = new Set();
  for (const c of [...roonManager._calls.browse, ...roonManager._calls.load]) {
    assert.ok(c.multi_session_key, 'call missing multi_session_key');
    keys.add(c.multi_session_key);
  }
  // A single play uses ONE session key across all its calls.
  assert.strictEqual(keys.size, 1);
});
