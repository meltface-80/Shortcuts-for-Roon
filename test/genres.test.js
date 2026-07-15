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
