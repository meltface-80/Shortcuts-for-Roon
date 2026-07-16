'use strict';

/**
 * Manual update checker. Reads the `version` from `package.json` on the repo's
 * default branch (GitHub raw) and reports whether it is newer than the installed
 * version WITHIN the same major.minor line (the pin — e.g. while on 1.0.x it only
 * offers 1.0.y, never 1.1.0). It never applies anything; the operator redeploys.
 * Reading the branch's package.json (rather than git tags/releases) means an
 * update is detected as soon as a new version is merged — no tagging required.
 * The extension_id stays constant, so an update is never a new Roon extension.
 */

/**
 * Parse a semver-ish string ("v1.2.3", "1.2.3-rc1") into components.
 * @param {string} s
 * @returns {{major:number,minor:number,patch:number}|null}
 */
function parseSemver(s) {
  const m = String(s == null ? '' : s)
    .trim()
    .replace(/^v/i, '')
    .match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!m) return null;
  return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]) };
}

/** Compare two parsed semvers. Returns <0, 0, or >0. */
function cmp(a, b) {
  if (a.major !== b.major) return a.major - b.major;
  if (a.minor !== b.minor) return a.minor - b.minor;
  return a.patch - b.patch;
}

/** Format a parsed semver back to "major.minor.patch". */
function fmt(v) {
  return `${v.major}.${v.minor}.${v.patch}`;
}

/**
 * Read the published `version` from package.json on a repo branch (GitHub raw).
 * @param {string} owner
 * @param {string} repo
 * @param {string} branch
 * @param {Function} [fetchImpl] injected fetch (defaults to global fetch)
 * @returns {Promise<string>}
 */
async function fetchRemoteVersion(owner, repo, branch, fetchImpl) {
  const f = fetchImpl || globalThis.fetch;
  if (typeof f !== 'function') throw new Error('fetch is not available');
  const url = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/package.json`;
  const res = await f(url, { headers: { Accept: 'application/json', 'User-Agent': 'MusicD-Shortcuts' } });
  if (!res || !res.ok) {
    const status = res && res.status ? res.status : 'network error';
    throw new Error(`Update check failed (${status})`);
  }
  const body = await res.json();
  const version = body && body.version;
  if (!version) throw new Error('Could not read the published version');
  return String(version);
}

/**
 * Check for a newer release pinned to the current version's major.minor line.
 * @param {{owner:string, repo:string, branch?:string, currentVersion:string, fetchImpl?:Function}} params
 * @returns {Promise<{current:string, latest:string, remote:string, pinned:string, updateAvailable:boolean, newerLineAvailable:boolean, checkedAt:number}>}
 */
async function checkForUpdate({ owner, repo, branch, currentVersion, fetchImpl }) {
  const cur = parseSemver(currentVersion);
  if (!cur) throw new Error(`Invalid current version: ${currentVersion}`);
  const pinned = `${cur.major}.${cur.minor}.x`;

  const remoteStr = await fetchRemoteVersion(owner, repo, branch || 'main', fetchImpl);
  const remote = parseSemver(remoteStr);
  if (!remote) throw new Error(`Could not parse the published version: ${remoteStr}`);

  const inPin = remote.major === cur.major && remote.minor === cur.minor;
  const newer = cmp(remote, cur) > 0;
  const updateAvailable = inPin && newer;

  return {
    current: fmt(cur),
    latest: updateAvailable ? fmt(remote) : fmt(cur),
    remote: fmt(remote),
    pinned,
    updateAvailable,
    // A newer major.minor line exists but you're pinned (informational only).
    newerLineAvailable: !inPin && newer,
    checkedAt: Date.now(),
  };
}

module.exports = { parseSemver, cmp, fmt, fetchRemoteVersion, checkForUpdate };
