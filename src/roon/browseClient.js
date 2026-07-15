'use strict';

/**
 * Wrap a callback-style RoonApiBrowse object (browse/load take `(opts, cb)` and
 * call `cb(err, body)` where `err === false` means success) into a promise API.
 *
 * @param {{browse:Function, load:Function}} browseService raw RoonApiBrowse-like
 * @returns {{browse:(opts:object)=>Promise<object>, load:(opts:object)=>Promise<object>}}
 */
function makeBrowseClient(browseService) {
  if (!browseService || typeof browseService.browse !== 'function' || typeof browseService.load !== 'function') {
    throw new Error('makeBrowseClient requires an object with browse() and load()');
  }

  const call = (method, opts) =>
    new Promise((resolve, reject) => {
      browseService[method](opts, (err, body) => {
        // Roon signals success with err === false (NOT null).
        if (err !== false) {
          const msg = err && err.message ? err.message : String(err);
          reject(new Error(`Roon ${method} failed: ${msg}`));
          return;
        }
        resolve(body);
      });
    });

  return {
    browse: (opts) => call('browse', opts),
    load: (opts) => call('load', opts),
  };
}

module.exports = { makeBrowseClient };
