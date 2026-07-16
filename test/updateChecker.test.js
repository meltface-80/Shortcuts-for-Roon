'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { parseSemver, cmp, checkForUpdate } = require('../src/updateChecker');

/** Build a fake fetch that returns a package.json body with the given version. */
function fakeFetch(version, opts = {}) {
  return async () => ({
    ok: opts.ok !== false,
    status: opts.status || 200,
    json: async () => (opts.body !== undefined ? opts.body : { name: 'musicd-shortcuts', version }),
  });
}

test('parseSemver handles v-prefix, plain, and invalid', () => {
  assert.deepStrictEqual(parseSemver('v1.2.3'), { major: 1, minor: 2, patch: 3 });
  assert.deepStrictEqual(parseSemver('1.0.1'), { major: 1, minor: 0, patch: 1 });
  assert.strictEqual(parseSemver('nope'), null);
  assert.strictEqual(parseSemver(''), null);
});

test('cmp orders semvers', () => {
  assert.ok(cmp(parseSemver('1.0.2'), parseSemver('1.0.1')) > 0);
  assert.ok(cmp(parseSemver('1.0.1'), parseSemver('1.1.0')) < 0);
  assert.strictEqual(cmp(parseSemver('1.0.1'), parseSemver('1.0.1')), 0);
});

test('detects a newer patch on the same line (reads package.json version)', async () => {
  const r = await checkForUpdate({ owner: 'o', repo: 'r', currentVersion: '1.0.1', fetchImpl: fakeFetch('1.0.2') });
  assert.strictEqual(r.current, '1.0.1');
  assert.strictEqual(r.latest, '1.0.2');
  assert.strictEqual(r.remote, '1.0.2');
  assert.strictEqual(r.pinned, '1.0.x');
  assert.strictEqual(r.updateAvailable, true);
  assert.strictEqual(r.newerLineAvailable, false);
});

test('up to date when the published version equals the installed one', async () => {
  const r = await checkForUpdate({ owner: 'o', repo: 'r', currentVersion: '1.0.2', fetchImpl: fakeFetch('1.0.2') });
  assert.strictEqual(r.updateAvailable, false);
  assert.strictEqual(r.latest, '1.0.2');
});

test('a newer minor/major is NOT offered while pinned, but is flagged', async () => {
  const r = await checkForUpdate({ owner: 'o', repo: 'r', currentVersion: '1.0.1', fetchImpl: fakeFetch('1.1.0') });
  assert.strictEqual(r.updateAvailable, false);
  assert.strictEqual(r.latest, '1.0.1');
  assert.strictEqual(r.remote, '1.1.0');
  assert.strictEqual(r.newerLineAvailable, true);
});

test('uses the configured branch in the raw URL', async () => {
  let calledUrl = null;
  const fetchImpl = async (url) => { calledUrl = url; return { ok: true, json: async () => ({ version: '1.0.5' }) }; };
  await checkForUpdate({ owner: 'me', repo: 'App', branch: 'release', currentVersion: '1.0.1', fetchImpl });
  assert.strictEqual(calledUrl, 'https://raw.githubusercontent.com/me/App/release/package.json');
});

test('defaults to the main branch', async () => {
  let calledUrl = null;
  const fetchImpl = async (url) => { calledUrl = url; return { ok: true, json: async () => ({ version: '1.0.1' }) }; };
  await checkForUpdate({ owner: 'me', repo: 'App', currentVersion: '1.0.1', fetchImpl });
  assert.match(calledUrl, /\/main\/package\.json$/);
});

test('throws on a failed request', async () => {
  await assert.rejects(
    () => checkForUpdate({ owner: 'o', repo: 'r', currentVersion: '1.0.0', fetchImpl: fakeFetch('1.0.0', { ok: false, status: 404 }) }),
    /Update check failed \(404\)/
  );
});

test('throws when the published version is missing', async () => {
  await assert.rejects(
    () => checkForUpdate({ owner: 'o', repo: 'r', currentVersion: '1.0.0', fetchImpl: fakeFetch(undefined, { body: { name: 'x' } }) }),
    /Could not read the published version/
  );
});

test('rejects an invalid current version', async () => {
  await assert.rejects(
    () => checkForUpdate({ owner: 'o', repo: 'r', currentVersion: 'x', fetchImpl: fakeFetch('1.0.0') }),
    /Invalid current version/
  );
});
