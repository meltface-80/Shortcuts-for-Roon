'use strict';

const express = require('express');
const { playByGenrePathCandidates } = require('../../roon/albumPlayer');
const { PRESETS } = require('../../genres');

/** Send a plain-text response (iOS Shortcuts shows the body). */
function text(res, status, message) {
  res.status(status).type('text/plain').send(message);
}

/**
 * Run a play request and translate the outcome into a text response.
 * @param {object} roonManager
 * @param {{candidates:(string[][]|null), zoneId:(string|null)}} params
 * @param {import('express').Response} res
 */
async function runPlay(roonManager, { candidates, zoneId }, res) {
  if (!roonManager.isPaired()) {
    text(res, 503, 'Not connected to a Roon Core yet. Make sure the extension is enabled in Roon > Settings > Extensions.');
    return;
  }
  try {
    const result = await playByGenrePathCandidates({ roonManager, candidates, zoneId });
    const where = result.zoneName ? ` in ${result.zoneName}` : '';
    const what = result.album ? result.album : 'a random album';
    text(res, 200, `Playing ${what}${where}`);
  } catch (err) {
    text(res, 500, err.message || 'Failed to play album');
  }
}

/**
 * Webhook TRIGGER routes (GET, text/plain responses).
 * @param {{roonManager:object, webhooksRepo:object}} deps
 * @returns {import('express').Router}
 */
function triggerRoutes({ roonManager, webhooksRepo }) {
  const router = express.Router();

  router.get('/w/:slug', async (req, res) => {
    const webhook = webhooksRepo.getBySlug(req.params.slug);
    if (!webhook) {
      text(res, 404, `No webhook named "${req.params.slug}"`);
      return;
    }
    await runPlay(
      roonManager,
      { candidates: webhook.genrePath, zoneId: webhook.zoneId || null },
      res
    );
  });

  // Legacy/compat endpoint.
  router.get('/random-album', async (req, res) => {
    const genre = req.query.genre ? String(req.query.genre).trim() : '';
    let candidates = null;
    if (genre) {
      const preset = PRESETS.find((p) => p.label.toLowerCase() === genre.toLowerCase());
      candidates = preset ? preset.genrePath : [[genre]];
    }
    await runPlay(roonManager, { candidates, zoneId: null }, res);
  });

  return router;
}

module.exports = { triggerRoutes };
