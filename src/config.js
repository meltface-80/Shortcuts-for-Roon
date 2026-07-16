'use strict';

const os = require('node:os');
const path = require('node:path');
const pkg = require('../package.json');

/**
 * Detect the first non-internal IPv4 LAN address, so webhook URLs shown to the
 * user point at a reachable host by default.
 * @returns {string} an IPv4 address or "localhost" if none found.
 */
function detectLanIp() {
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

/**
 * Build the runtime configuration from environment variables. Pure aside from
 * reading process.env / os network interfaces.
 * @param {NodeJS.ProcessEnv} [env=process.env]
 */
function loadConfig(env = process.env) {
  const PORT = parseInt(env.PORT, 10) || 3000;
  const DATA_DIR = path.resolve(env.DATA_DIR || './data');
  const DB_PATH = env.DB_PATH ? path.resolve(env.DB_PATH) : path.join(DATA_DIR, 'webhooks.db');
  const PUBLIC_BASE_URL = (env.PUBLIC_BASE_URL || `http://${detectLanIp()}:${PORT}`).replace(/\/+$/, '');

  return {
    PORT,
    DATA_DIR,
    DB_PATH,
    PUBLIC_BASE_URL,
    // Roon extension metadata (overridable via env).
    // ROON_EXTENSION_ID is the STABLE identity Roon keys authorisation on.
    // NEVER change it across versions — a new id makes Roon show the extension
    // as a new/duplicate entry needing re-authorisation. Version bumps are safe.
    ROON_EXTENSION_ID: env.ROON_EXTENSION_ID || 'com.musicd.shortcuts',
    ROON_DISPLAY_NAME: env.ROON_DISPLAY_NAME || 'MusicD Shortcuts',
    ROON_DISPLAY_VERSION: env.ROON_DISPLAY_VERSION || pkg.version,
    ROON_PUBLISHER: env.ROON_PUBLISHER || 'MusicD Shortcuts',
    ROON_EMAIL: env.ROON_EMAIL || 'musicd-shortcuts@example.com',
    ROON_WEBSITE: env.ROON_WEBSITE || 'https://github.com/meltface-80/MusicD-Shortcuts',
    // Update check (manual, from Roon settings). Pinned to the installed
    // version's major.minor line (e.g. 1.0.x) — see src/updateChecker.js.
    VERSION: pkg.version,
    GITHUB_OWNER: env.GITHUB_OWNER || 'meltface-80',
    GITHUB_REPO: env.GITHUB_REPO || 'MusicD-Shortcuts',
  };
}

module.exports = { loadConfig, detectLanIp };
