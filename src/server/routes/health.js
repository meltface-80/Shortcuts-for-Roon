'use strict';

const express = require('express');

/**
 * Health check route.
 * @returns {import('express').Router}
 */
function healthRoutes() {
  const router = express.Router();
  router.get('/healthz', (req, res) => {
    res.json({ ok: true });
  });
  return router;
}

module.exports = { healthRoutes };
