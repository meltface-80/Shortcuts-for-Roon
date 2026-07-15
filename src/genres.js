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
  { key: 'metal', label: 'Metal', genrePath: [['Metal'], ['Heavy Metal']] },
  { key: 'jazz', label: 'Jazz', genrePath: [['Jazz']] },
  { key: 'electronic', label: 'Electronic', genrePath: [['Electronic']] },
  { key: 'trip-hop', label: 'Trip-Hop', genrePath: [['Trip-Hop'], ['Electronic', 'Trip-Hop']] },
];

/**
 * Look up a preset by its key.
 * @param {string} key
 * @returns {{key:string,label:string,genrePath:(string[][]|null)}|undefined}
 */
function getPreset(key) {
  return PRESETS.find((p) => p.key === key);
}

module.exports = { PRESETS, getPreset };
