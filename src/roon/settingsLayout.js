'use strict';

const { PRESETS, getPreset } = require('../genres');

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
  const values = settings || {};

  const presetOptions = [{ title: '— none —', value: '' }].concat(
    PRESETS.map((p) => ({ title: p.label, value: p.key }))
  );

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

  return {
    values,
    layout: [
      {
        type: 'group',
        title: 'Create a shortcut webhook',
        items: [
          {
            type: 'dropdown',
            title: 'Genre preset',
            setting: 'preset',
            values: presetOptions,
          },
          {
            type: 'string',
            title: 'Custom genre (optional, overrides preset)',
            setting: 'customGenre',
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

    // Real save: create a webhook when a preset or custom genre is chosen.
    const presetKey = incoming.preset || '';
    const customGenre = (incoming.customGenre || '').trim();
    const zoneId = zoneWidgetToId(incoming.defaultZone);

    if (customGenre) {
      webhooksRepo.create({
        name: `${customGenre} Random`,
        genre: customGenre,
        genrePath: [[customGenre]],
        zoneId,
        zoneName: null,
      });
    } else if (presetKey) {
      const preset = getPreset(presetKey);
      if (preset) {
        webhooksRepo.create({
          name: `${preset.label} Random`,
          genre: preset.genrePath ? preset.label : null,
          genrePath: preset.genrePath,
          zoneId,
          zoneName: null,
        });
      }
    }

    // Persist the chosen default zone.
    if (zoneId && typeof onDefaultZone === 'function') {
      onDefaultZone(zoneId);
    }

    // Reset the dropdown/custom fields for the next creation.
    const nextValues = { ...incoming, preset: '', customGenre: '' };
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
