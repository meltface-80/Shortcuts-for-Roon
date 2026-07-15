'use strict';

const crypto = require('node:crypto');

/**
 * @typedef {object} RoonManagerLike
 * @property {()=>Array<{zoneId:string,displayName:string,state:string}>} getZones
 * @property {()=>(string|null)} getDefaultZoneId
 * @property {(opts:object)=>Promise<object>} browse
 * @property {(opts:object)=>Promise<object>} load
 */

/** Random integer in [0, max). */
function randInt(max) {
  return Math.floor(Math.random() * max);
}

/** Case-insensitive, trimmed exact title match. */
function matchTitle(item, title) {
  return (
    item &&
    typeof item.title === 'string' &&
    item.title.trim().toLowerCase() === String(title).trim().toLowerCase()
  );
}

/**
 * Build the navigation path (up to and including the random-album selection).
 * The empty string `''` means "pick a RANDOM item at this list level".
 * @param {string[]|null} genrePath a single genre path (e.g. ["Electronic","Trip-Hop"]) or null/[]
 * @returns {string[]}
 */
function buildNavPath(genrePath) {
  if (Array.isArray(genrePath) && genrePath.length > 0) {
    return ['Genres', ...genrePath, 'Albums', ''];
  }
  return ['Library', 'Albums', ''];
}

/** Build a clear error message for a missing named segment. */
function missingSegmentMessage(segment, genrePath) {
  if (Array.isArray(genrePath) && genrePath.includes(segment)) {
    return `Genre "${segment}" not found in your library`;
  }
  return `"${segment}" not found in your Roon library`;
}

/**
 * Load every item at the current browse level (paginated).
 * @param {RoonManagerLike} roonManager
 * @param {string} msk multi_session_key
 * @returns {Promise<Array<{item_key:string,title:string,hint?:string}>>}
 */
async function loadAllItems(roonManager, msk) {
  const items = [];
  const pageSize = 100;
  let offset = 0;
  for (let guard = 0; guard < 1000; guard += 1) {
    const loaded = await roonManager.load({
      hierarchy: 'browse',
      offset,
      count: pageSize,
      multi_session_key: msk,
    });
    const batch = (loaded && loaded.items) || [];
    items.push(...batch);
    if (batch.length < pageSize) break;
    offset += batch.length;
  }
  return items;
}

/**
 * Given that we have browsed INTO an album, find and trigger "Play Now".
 * Handles both the nested "Play Album" -> "Play Now" action-list and the case
 * where "Play Now" is a direct child.
 * @param {RoonManagerLike} roonManager
 * @param {string} msk
 * @param {string} zoneId
 */
async function triggerPlay(roonManager, msk, zoneId) {
  let items = await loadAllItems(roonManager, msk);

  let playNow = items.find((it) => matchTitle(it, 'Play Now'));

  if (!playNow) {
    // Descend into an action-list: "Play Album" / "Play" / any hint action_list.
    const actionList =
      items.find((it) => matchTitle(it, 'Play Album')) ||
      items.find((it) => matchTitle(it, 'Play')) ||
      items.find((it) => it && it.hint === 'action_list');
    if (!actionList) {
      throw new Error('Could not find a play action for this album');
    }
    await roonManager.browse({
      hierarchy: 'browse',
      item_key: actionList.item_key,
      multi_session_key: msk,
    });
    items = await loadAllItems(roonManager, msk);
    playNow =
      items.find((it) => matchTitle(it, 'Play Now')) ||
      items.find((it) => matchTitle(it, 'Play')) ||
      items.find((it) => it && it.hint === 'action');
    if (!playNow) {
      throw new Error('Could not find "Play Now" for this album');
    }
  }

  // The browse of the "Play Now" item WITH the zone starts playback.
  await roonManager.browse({
    hierarchy: 'browse',
    item_key: playNow.item_key,
    zone_or_output_id: zoneId,
    multi_session_key: msk,
  });
}

/**
 * Resolve the target zone: the explicit id, else the manager's default.
 * @param {RoonManagerLike} roonManager
 * @param {string|null} [zoneId]
 * @returns {{zoneId:string|null, zoneName:string|null}}
 */
function resolveZone(roonManager, zoneId) {
  const zones = (roonManager.getZones && roonManager.getZones()) || [];
  const targetId = zoneId || (roonManager.getDefaultZoneId && roonManager.getDefaultZoneId()) || null;
  let zoneName = null;
  if (targetId) {
    const z = zones.find(
      (zz) => zz.zoneId === targetId || zz.zone_id === targetId || zz.output_id === targetId
    );
    if (z) zoneName = z.displayName || z.display_name || null;
  }
  return { zoneId: targetId, zoneName };
}

/**
 * Play a random album, optionally filtered to a single genre path.
 * @param {{roonManager:RoonManagerLike, genrePath?:string[]|null, zoneId?:string|null}} params
 * @returns {Promise<{album:string, zoneId:string, zoneName:string|null}>}
 */
async function playRandomAlbum({ roonManager, genrePath, zoneId }) {
  if (!roonManager) throw new Error('roonManager is required');
  const msk = crypto.randomUUID();

  const { zoneId: zid, zoneName } = resolveZone(roonManager, zoneId);
  if (!zid) {
    throw new Error('No Roon zone available. Choose a zone or start playback in Roon first.');
  }

  const navPath = buildNavPath(genrePath);

  // Start at the browse root.
  let body = await roonManager.browse({ hierarchy: 'browse', pop_all: true, multi_session_key: msk });
  let albumTitle = null;

  for (let i = 0; i < navPath.length; i += 1) {
    const segment = navPath[i];

    if (segment === '') {
      const count = body && body.list && typeof body.list.count === 'number' ? body.list.count : 0;
      if (count <= 0) {
        const label = Array.isArray(genrePath) && genrePath.length ? `genre "${genrePath[genrePath.length - 1]}"` : 'your library';
        throw new Error(`No albums found for ${label}`);
      }
      const offset = randInt(count);
      const loaded = await roonManager.load({ hierarchy: 'browse', offset, count: 1, multi_session_key: msk });
      const item = loaded && loaded.items && loaded.items[0];
      if (!item) throw new Error('Failed to load a random album');
      albumTitle = item.title;
      body = await roonManager.browse({ hierarchy: 'browse', item_key: item.item_key, multi_session_key: msk });
    } else {
      const items = await loadAllItems(roonManager, msk);
      const item = items.find((it) => matchTitle(it, segment));
      if (!item) throw new Error(missingSegmentMessage(segment, genrePath));
      body = await roonManager.browse({ hierarchy: 'browse', item_key: item.item_key, multi_session_key: msk });
    }
  }

  // `body` now describes the album's action level. Trigger playback.
  await triggerPlay(roonManager, msk, zid);

  return { album: albumTitle, zoneId: zid, zoneName };
}

/**
 * Try each candidate genre path in order until one succeeds. `candidates` is an
 * array of path arrays (e.g. [["Trip-Hop"], ["Electronic","Trip-Hop"]]), or
 * null/[] for "any album".
 * @param {{roonManager:RoonManagerLike, candidates?:(string[][]|null), zoneId?:string|null}} params
 */
async function playByGenrePathCandidates({ roonManager, candidates, zoneId }) {
  if (!candidates || candidates.length === 0) {
    return playRandomAlbum({ roonManager, genrePath: null, zoneId });
  }
  let lastErr = null;
  for (const candidate of candidates) {
    try {
      return await playRandomAlbum({ roonManager, genrePath: candidate, zoneId });
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error('No matching genre path found in your library');
}

module.exports = {
  playRandomAlbum,
  playByGenrePathCandidates,
  resolveZone,
  buildNavPath,
};
