'use strict';

/**
 * The six built-in genre presets.
 * `genrePath` is an array of CANDIDATE paths (each candidate an array of genre
 * title levels to drill in the Roon `Genres` browser). `null` means "any album".
 * @type {Array<{key:string,label:string,genrePath:(string[][]|null)}>}
 */
const PRESETS = [
  { key: 'any', label: 'Any Album', genrePath: null },
  { key: 'pop-rock', label: 'Pop/Rock', genrePath: [['Pop/Rock']] },
  // Metal / Heavy Metal are AllMusic subgenres nested under "Pop/Rock" in most
  // Roon libraries, so include the drill-down paths as candidates.
  { key: 'metal', label: 'Metal', genrePath: [['Metal'], ['Heavy Metal'], ['Pop/Rock', 'Heavy Metal'], ['Pop/Rock', 'Metal']] },
  { key: 'jazz', label: 'Jazz', genrePath: [['Jazz']] },
  { key: 'electronic', label: 'Electronic', genrePath: [['Electronic']] },
  { key: 'trip-hop', label: 'Trip-Hop', genrePath: [['Trip-Hop'], ['Electronic', 'Trip-Hop']] },
];

/** Upper bound on how many albums a single webhook may queue. */
const MAX_ALBUM_COUNT = 50;

/**
 * Look up a preset by its key.
 * @param {string} key
 * @returns {{key:string,label:string,genrePath:(string[][]|null)}|undefined}
 */
function getPreset(key) {
  return PRESETS.find((p) => p.key === key);
}

/**
 * Resolve a single genre NAME to its candidate-path array. If the name matches a
 * preset label (case-insensitive) the preset's candidate paths are used (so
 * "Metal" gets the Metal/Heavy-Metal fallback, "Trip-Hop" the Electronic drill,
 * etc.); otherwise it falls back to a single literal path.
 * @param {string} name
 * @returns {string[][]|null} candidate paths, or null for an empty name.
 */
function genreNameToCandidates(name) {
  const n = String(name == null ? '' : name).trim();
  if (!n) return null;
  // Explicit nested path for subgenres, e.g. "Pop/Rock > Heavy Metal" — drill
  // Genres -> Pop/Rock -> Heavy Metal. (">" avoids clashing with the "/" in
  // genre names like "Pop/Rock".)
  if (n.includes('>')) {
    const path = n.split('>').map((s) => s.trim()).filter(Boolean);
    return path.length ? [path] : null;
  }
  const preset = PRESETS.find((p) => p.label.toLowerCase() === n.toLowerCase() && p.genrePath);
  if (preset) return preset.genrePath;
  return [[n]];
}

/**
 * Parse a multi-genre selection into "genre sets" — an array where each element
 * is the candidate-path array for ONE genre. Accepts a comma / semicolon / "&" /
 * newline separated string ("Metal & Electronic") or an array of names. Returns
 * null when nothing usable is given (meaning "any genre").
 * @param {string|string[]|null|undefined} input
 * @returns {string[][][]|null}
 */
function parseGenres(input) {
  let names = [];
  if (Array.isArray(input)) names = input;
  else if (typeof input === 'string') names = input.split(/[,;&\n]+/);
  names = names.map((s) => String(s == null ? '' : s).trim()).filter(Boolean);
  if (!names.length) return null;
  const sets = names.map(genreNameToCandidates).filter(Boolean);
  return sets.length ? sets : null;
}

/**
 * Clamp an album count to an integer in [1, MAX_ALBUM_COUNT].
 * @param {*} n
 * @returns {number}
 */
function clampCount(n) {
  const v = Math.floor(Number(n));
  if (!Number.isFinite(v) || v < 1) return 1;
  return Math.min(v, MAX_ALBUM_COUNT);
}

module.exports = { PRESETS, getPreset, genreNameToCandidates, parseGenres, clampCount, MAX_ALBUM_COUNT };
