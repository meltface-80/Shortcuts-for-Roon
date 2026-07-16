'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { PRESETS, getPreset } = require('../src/genres');

test('there are exactly six presets with the expected keys', () => {
  assert.strictEqual(PRESETS.length, 6);
  const keys = PRESETS.map((p) => p.key);
  assert.deepStrictEqual(keys, ['any', 'pop-rock', 'metal', 'jazz', 'electronic', 'trip-hop']);
});

test('each preset has key/label/genrePath shape', () => {
  for (const p of PRESETS) {
    assert.strictEqual(typeof p.key, 'string');
    assert.strictEqual(typeof p.label, 'string');
    assert.ok(p.genrePath === null || Array.isArray(p.genrePath), `${p.key} genrePath`);
    if (Array.isArray(p.genrePath)) {
      for (const candidate of p.genrePath) assert.ok(Array.isArray(candidate));
    }
  }
});

test('any is the only null-genrePath preset', () => {
  assert.strictEqual(getPreset('any').genrePath, null);
  assert.deepStrictEqual(getPreset('jazz').genrePath, [['Jazz']]);
  assert.deepStrictEqual(getPreset('trip-hop').genrePath, [['Trip-Hop'], ['Electronic', 'Trip-Hop']]);
  assert.deepStrictEqual(getPreset('metal').genrePath, [['Metal'], ['Heavy Metal']]);
});

test('getPreset returns undefined for unknown key', () => {
  assert.strictEqual(getPreset('nope'), undefined);
});

/* --- multi-genre + count helpers ---------------------------------------- */

const { genreNameToCandidates, parseGenres, clampCount, MAX_ALBUM_COUNT } = require('../src/genres');

test('genreNameToCandidates maps preset labels to their candidate paths', () => {
  assert.deepStrictEqual(genreNameToCandidates('Jazz'), [['Jazz']]);
  // case-insensitive preset match keeps the fallback candidates (Metal -> Heavy Metal)
  assert.deepStrictEqual(genreNameToCandidates('metal'), [['Metal'], ['Heavy Metal']]);
  assert.deepStrictEqual(genreNameToCandidates('Trip-Hop'), [['Trip-Hop'], ['Electronic', 'Trip-Hop']]);
  // unknown genre -> single literal path
  assert.deepStrictEqual(genreNameToCandidates('Ambient'), [['Ambient']]);
  assert.strictEqual(genreNameToCandidates(''), null);
});

test('parseGenres splits on comma / & / semicolon and resolves each', () => {
  assert.strictEqual(parseGenres(''), null);
  assert.strictEqual(parseGenres(null), null);
  assert.deepStrictEqual(parseGenres('Jazz'), [[['Jazz']]]);
  assert.deepStrictEqual(parseGenres('Metal & Electronic'), [
    [['Metal'], ['Heavy Metal']],
    [['Electronic']],
  ]);
  assert.deepStrictEqual(parseGenres(['Jazz', 'Electronic']), [[['Jazz']], [['Electronic']]]);
  // extra separators / whitespace are ignored
  assert.deepStrictEqual(parseGenres(' Jazz ,, ; Electronic '), [[['Jazz']], [['Electronic']]]);
});

test('clampCount coerces to an integer in [1, MAX]', () => {
  assert.strictEqual(clampCount(1), 1);
  assert.strictEqual(clampCount(7), 7);
  assert.strictEqual(clampCount(0), 1);
  assert.strictEqual(clampCount(-5), 1);
  assert.strictEqual(clampCount('3'), 3);
  assert.strictEqual(clampCount('nope'), 1);
  assert.strictEqual(clampCount(9999), MAX_ALBUM_COUNT);
  assert.strictEqual(clampCount(2.9), 2);
});
