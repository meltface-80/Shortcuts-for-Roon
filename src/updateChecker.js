'use strict';

/**
 * Manual update checker. Reads GitHub tags for the extension's repo and reports
 * whether a newer release exists WITHIN the installed version's major.minor line
 * (e.g. while on 1.0.0 it only offers 1.0.1, 1.0.2, … — never 1.1.0 or 2.0.0).
 * It never applies anything; the operator redeploys the container to update.
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
 * Fetch tag names for a GitHub repo.
 * @param {string} owner
 * @param {string} repo
 * @param {Function} [fetchImpl] injected fetch (defaults to global fetch)
 * @returns {Promise<string[]>}
 */
async function fetchTags(owner, repo, fetchImpl) {
  const f = fetchImpl || globalThis.fetch;
  if (typeof f !== 'function') throw new Error('fetch is not available');
  const res = await f(`https://api.github.com/repos/${owner}/${repo}/tags?per_page=100`, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'MusicD-Shortcuts' },
  });
  if (!res || !res.ok) {
    const status = res && res.status ? res.status : 'network error';
    throw new Error(`GitHub API request failed (${status})`);
  }
  const body = await res.json();
  return Array.isArray(body) ? body.map((t) => t && t.name).filter(Boolean) : [];
}

/**
 * Check for a newer release pinned to the current version's major.minor line.
 * @param {{owner:string, repo:string, currentVersion:string, fetchImpl?:Function}} params
 * @returns {Promise<{current:string, latest:string, pinned:string, updateAvailable:boolean, checkedAt:number}>}
 */
async function checkForUpdate({ owner, repo, currentVersion, fetchImpl }) {
  const cur = parseSemver(currentVersion);
  if (!cur) throw new Error(`Invalid current version: ${currentVersion}`);
  const pinned = `${cur.major}.${cur.minor}.x`;

  const names = await fetchTags(owner, repo, fetchImpl);
  // Keep only tags on the same major.minor line (the pin).
  const inLine = names
    .map(parseSemver)
    .filter((v) => v && v.major === cur.major && v.minor === cur.minor);

  let latest = cur;
  for (const v of inLine) {
    if (cmp(v, latest) > 0) latest = v;
  }

  return {
    current: fmt(cur),
    latest: fmt(latest),
    pinned,
    updateAvailable: cmp(latest, cur) > 0,
    checkedAt: Date.now(),
  };
}

module.exports = { parseSemver, cmp, fmt, fetchTags, checkForUpdate };
