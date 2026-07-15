'use strict';

/**
 * An in-memory fake of the Roon browse tree + a roonManager that walks it,
 * matching the interface albumPlayer/routes depend on:
 *   { isPaired, getCoreName, getStatusMessage, getZones, getDefaultZoneId,
 *     browse(opts):Promise, load(opts):Promise }
 *
 * The tree is a set of "nodes". Each node has:
 *   { title, hint, count, items?:[childNode], onPlay?:fn }
 * A node's `items` are its children (the next browse level). `count` is derived
 * from items.length unless overridden.
 *
 * Browse/load emulate Roon: browse({pop_all}) resets to root; browse({item_key})
 * descends into a child and sets it as the current level; load() returns the
 * current level's items (respecting offset/count). Passing zone_or_output_id on
 * a node with onPlay records the play.
 */

let keyCounter = 0;
function assignKeys(node) {
  node._key = `k${keyCounter++}`;
  for (const child of node.items || []) assignKeys(child);
  return node;
}

/** Build a leaf album node: album -> "Play Album" -> "Play Now". */
function albumNode(title) {
  return {
    title,
    items: [
      {
        title: 'Play Album',
        hint: 'action_list',
        items: [
          { title: 'Play Now', hint: 'action', isPlayNow: true },
          { title: 'Add Next', hint: 'action' },
          { title: 'Queue', hint: 'action' },
        ],
      },
      { title: 'Play Artist Radio', hint: 'action_list', items: [{ title: 'Play Now', hint: 'action' }] },
    ],
  };
}

/**
 * Build a default fake tree:
 *   root -> Library -> Albums -> [N albums]
 *        -> Genres  -> [Jazz -> Albums -> [albums],
 *                       Electronic -> [Trip-Hop -> Albums -> [albums], Albums -> [albums]]]
 * @param {{albums?:number}} [opts]
 */
function buildDefaultTree(opts = {}) {
  const n = opts.albums == null ? 5 : opts.albums;
  const mkAlbums = (prefix, count) =>
    Array.from({ length: count }, (_, i) => albumNode(`${prefix} Album ${i + 1}`));

  const root = {
    title: 'Root',
    items: [
      {
        title: 'Library',
        items: [{ title: 'Albums', items: mkAlbums('Library', n) }],
      },
      {
        title: 'Genres',
        items: [
          { title: 'Jazz', items: [{ title: 'Albums', items: mkAlbums('Jazz', 3) }] },
          {
            title: 'Electronic',
            items: [
              { title: 'Albums', items: mkAlbums('Electronic', 4) },
              { title: 'Trip-Hop', items: [{ title: 'Albums', items: mkAlbums('Trip-Hop', 2) }] },
            ],
          },
        ],
      },
    ],
  };
  keyCounter = 0;
  assignKeys(root);
  return root;
}

/**
 * Create a fake roonManager over a browse tree.
 * @param {object} [config]
 * @param {object} [config.tree] a tree (from buildDefaultTree)
 * @param {boolean} [config.paired]
 * @param {Array} [config.zones]
 * @param {string} [config.defaultZoneId]
 */
function createFakeRoonManager(config = {}) {
  const tree = config.tree || buildDefaultTree();
  const paired = config.paired !== false;
  const zones = config.zones || [
    { zoneId: 'zone-1', displayName: 'Living Room', state: 'stopped' },
    { zoneId: 'zone-2', displayName: 'Kitchen', state: 'playing' },
  ];
  const defaultZoneId = 'defaultZoneId' in config ? config.defaultZoneId : 'zone-1';

  // Index nodes by key for O(1) descent.
  const byKey = new Map();
  (function index(node) {
    byKey.set(node._key, node);
    for (const c of node.items || []) index(c);
  })(tree);

  // Per multi_session_key "current level" state.
  const sessions = new Map();
  const calls = { browse: [], load: [] };
  const plays = [];

  const listOf = (node) => ({
    title: node.title,
    count: (node.items || []).length,
    level: 0,
    hint: node.hint || null,
  });

  const manager = {
    _tree: tree,
    _calls: calls,
    _plays: plays,

    isPaired: () => paired,
    getCoreName: () => (paired ? 'Fake Core' : null),
    getStatusMessage: () => (paired ? 'Paired with Fake Core.' : 'Not paired.'),
    getZones: () => zones.slice(),
    getDefaultZoneId: () => defaultZoneId,

    browse(opts) {
      calls.browse.push(opts);
      const msk = opts.multi_session_key || '_default';

      if (opts.pop_all) {
        sessions.set(msk, tree);
        return Promise.resolve({ action: 'list', list: listOf(tree) });
      }

      if (opts.item_key) {
        const node = byKey.get(opts.item_key);
        if (!node) return Promise.reject(new Error('Unknown item_key'));

        // Play trigger: node marked isPlayNow with a zone provided.
        if (node.isPlayNow && opts.zone_or_output_id) {
          plays.push({ node, zoneId: opts.zone_or_output_id, msk });
          return Promise.resolve({ action: 'none', list: null });
        }
        sessions.set(msk, node);
        return Promise.resolve({ action: 'list', list: listOf(node) });
      }

      // Bare browse (no item_key / pop_all): return current level.
      const cur = sessions.get(msk) || tree;
      return Promise.resolve({ action: 'list', list: listOf(cur) });
    },

    load(opts) {
      calls.load.push(opts);
      const msk = opts.multi_session_key || '_default';
      const cur = sessions.get(msk) || tree;
      const items = (cur.items || []).map((c) => ({
        item_key: c._key,
        title: c.title,
        subtitle: null,
        hint: c.hint || null,
      }));
      const offset = opts.offset || 0;
      const count = typeof opts.count === 'number' ? opts.count : items.length;
      const slice = items.slice(offset, offset + count);
      return Promise.resolve({ list: listOf(cur), offset, items: slice });
    },
  };

  return manager;
}

module.exports = { createFakeRoonManager, buildDefaultTree, albumNode };
