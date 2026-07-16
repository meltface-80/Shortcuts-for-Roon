'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { parseSemver, cmp, checkForUpdate } = require('../src/updateChecker');

/** Build a fake fetch that returns the given tag names. */
function fakeFetch(names, opts = {}) {
  return async () => ({
    ok: opts.ok !== false,
    status: opts.status || 200,
    json: async () => (opts.body != null ? opts.body : names.map((n) => ({ name: n }))),
  });
}

test('parseSemver handles v-prefix, plain, and invalid', () => {
  assert.deepStrictEqual(parseSemver('v1.2.3'), { major: 1, minor: 2, patch: 3 });
  assert.deepStrictEqual(parseSemver('1.0.1'), { major: 1, minor: 0, patch: 1 });
  assert.deepStrictEqual(parseSemver('1.0.1-rc2'), { major: 1, minor: 0, patch: 1 });
  assert.strictEqual(parseSemver('nope'), null);
  assert.strictEqual(parseSemver(''), null);
});

test('cmp orders semvers', () => {
  assert.ok(cmp(parseSemver('1.0.2'), parseSemver('1.0.1')) > 0);
  assert.ok(cmp(parseSemver('1.0.1'), parseSemver('1.1.0')) < 0);
  assert.strictEqual(cmp(parseSemver('1.0.1'), parseSemver('1.0.1')), 0);
});

test('checkForUpdate reports a newer patch on the same major.minor line', async () => {
  const r = await checkForUpdate({
    owner: 'o',
    repo: 'r',
    currentVersion: '1.0.0',
    fetchImpl: fakeFetch(['v1.0.0', 'v1.0.1', 'v1.0.2', 'v1.1.0', 'v2.0.0']),
  });
  assert.strictEqual(r.current, '1.0.0');
  assert.strictEqual(r.latest, '1.0.2');
  assert.strictEqual(r.pinned, '1.0.x');
  assert.strictEqual(r.updateAvailable, true);
  assert.ok(typeof r.checkedAt === 'number');
});

test('checkForUpdate ignores newer minor/major (stays pinned to 1.0.x)', async () => {
  const r = await checkForUpdate({
    owner: 'o',
    repo: 'r',
    currentVersion: '1.0.2',
    fetchImpl: fakeFetch(['v1.0.0', 'v1.0.1', 'v1.0.2', 'v1.1.0', 'v2.3.4']),
  });
  assert.strictEqual(r.latest, '1.0.2');
  assert.strictEqual(r.updateAvailable, false);
});

test('checkForUpdate is up-to-date when no matching tags exist', async () => {
  const r = await checkForUpdate({
    owner: 'o',
    repo: 'r',
    currentVersion: '1.0.1',
    fetchImpl: fakeFetch(['v1.1.0', 'v2.0.0']),
  });
  assert.strictEqual(r.latest, '1.0.1');
  assert.strictEqual(r.updateAvailable, false);
});

test('checkForUpdate handles an empty tag list', async () => {
  const r = await checkForUpdate({
    owner: 'o', repo: 'r', currentVersion: '1.0.0', fetchImpl: fakeFetch([]),
  });
  assert.strictEqual(r.updateAvailable, false);
  assert.strictEqual(r.latest, '1.0.0');
});

test('checkForUpdate throws on a failed request', async () => {
  await assert.rejects(
    () => checkForUpdate({ owner: 'o', repo: 'r', currentVersion: '1.0.0', fetchImpl: fakeFetch([], { ok: false, status: 403 }) }),
    /GitHub API request failed \(403\)/
  );
});

test('checkForUpdate rejects an invalid current version', async () => {
  await assert.rejects(
    () => checkForUpdate({ owner: 'o', repo: 'r', currentVersion: 'x', fetchImpl: fakeFetch([]) }),
    /Invalid current version/
  );
});
