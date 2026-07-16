'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { makeSettingsService } = require('../src/roon/settingsLayout');

function makeFakeRoon() {
  const store = {};
  return {
    _store: store,
    save_config: (k, v) => { store[k] = v; },
    load_config: (k) => store[k],
  };
}

function FakeSettings(roon, opts) {
  this.opts = opts;
  this.updates = [];
  this.update_settings = (layout) => { this.updates.push(layout); };
}

const config = { VERSION: '1.0.0', PUBLIC_BASE_URL: 'http://server:3000' };
const repo = { list: () => [] };

function updateLabel(layout) {
  const grp = layout.layout.find((w) => w.type === 'group' && w.title === 'Software update');
  return grp.items.find((i) => i.type === 'label').title;
}

test('settings expose a Software update section (not checked yet)', () => {
  const roon = makeFakeRoon();
  const { service } = makeSettingsService(roon, {
    RoonApiSettings: FakeSettings, webhooksRepo: repo, config, getZones: () => [],
    checkForUpdate: async () => ({}),
  });
  let layout;
  service.opts.get_settings((l) => { layout = l; });
  const groups = layout.layout.filter((w) => w.type === 'group').map((g) => g.title);
  assert.ok(groups.includes('Software update'));
  // The update section is the LAST widget in the settings.
  const last = layout.layout[layout.layout.length - 1];
  assert.strictEqual(last.type, 'group');
  assert.strictEqual(last.title, 'Software update');
  const lbl = updateLabel(layout);
  assert.match(lbl, /Installed version: v1\.0\.0 \(pinned to 1\.0\.x\)/);
  assert.match(lbl, /Not checked yet/);
});

test('manual "Check now" runs the check, persists + shows the result', async () => {
  const roon = makeFakeRoon();
  let checkCalls = 0;
  const { service } = makeSettingsService(roon, {
    RoonApiSettings: FakeSettings, webhooksRepo: repo, config, getZones: () => [],
    checkForUpdate: async () => {
      checkCalls += 1;
      return { current: '1.0.0', latest: '1.0.1', pinned: '1.0.x', updateAvailable: true, checkedAt: Date.now() };
    },
  });

  service.opts.save_settings({ send_complete() {} }, false, { values: { updateCheck: 'check' } });
  await new Promise((r) => setTimeout(r, 10));

  assert.strictEqual(checkCalls, 1);
  assert.ok(roon._store.updateResult && roon._store.updateResult.updateAvailable === true);
  const last = service.updates[service.updates.length - 1];
  assert.match(updateLabel(last), /Update available: v1\.0\.1/);
  // the check dropdown is reset for the next save
  assert.strictEqual(last.values.updateCheck, '');
});

test('a plain save does not trigger an update check', async () => {
  const roon = makeFakeRoon();
  let checkCalls = 0;
  const { service } = makeSettingsService(roon, {
    RoonApiSettings: FakeSettings, webhooksRepo: repo, config, getZones: () => [],
    checkForUpdate: async () => { checkCalls += 1; return {}; },
  });
  service.opts.save_settings({ send_complete() {} }, false, { values: {} });
  await new Promise((r) => setTimeout(r, 10));
  assert.strictEqual(checkCalls, 0);
});

test('a dry-run save never triggers a check', async () => {
  const roon = makeFakeRoon();
  let checkCalls = 0;
  const { service } = makeSettingsService(roon, {
    RoonApiSettings: FakeSettings, webhooksRepo: repo, config, getZones: () => [],
    checkForUpdate: async () => { checkCalls += 1; return {}; },
  });
  service.opts.save_settings({ send_complete() {} }, true, { values: { updateCheck: 'check' } });
  await new Promise((r) => setTimeout(r, 10));
  assert.strictEqual(checkCalls, 0);
});

test('a persisted result is shown on next get_settings', () => {
  const roon = makeFakeRoon();
  roon._store.updateResult = { current: '1.0.0', latest: '1.0.0', pinned: '1.0.x', updateAvailable: false, checkedAt: Date.now() };
  const { service } = makeSettingsService(roon, {
    RoonApiSettings: FakeSettings, webhooksRepo: repo, config, getZones: () => [],
    checkForUpdate: async () => ({}),
  });
  let layout;
  service.opts.get_settings((l) => { layout = l; });
  assert.match(updateLabel(layout), /Up to date/);
});
