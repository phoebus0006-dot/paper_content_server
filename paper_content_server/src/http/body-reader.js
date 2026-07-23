'use strict';

/**
 * Read the body of an HTTP request with a size limit.
 *
 * The default limit (1 MB) matches the existing production semantics.
 *
 * @param {import('http').IncomingMessage} req
 * @param {number} [limit=1048576] - Maximum body size in bytes
 * @returns {Promise<string>} The body as a UTF-8 string
 * @throws {Error} With code PAYLOAD_TOO_LARGE if body exceeds limit
 * @throws {Error} Propagates req error events
 */
function readBody(req, limit) {
  const maxLimit = limit || 1048576;
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    let overflow = false;

    function onData(chunk) {
      if (overflow) return;
      total += chunk.length;
      if (total > maxLimit) {
        overflow = true;
        req.removeListener('data', onData);
        if (typeof req.pause === 'function') req.pause();
        const err = new Error('payload too large');
        err.code = 'PAYLOAD_TOO_LARGE';
        reject(err);
        return;
      }
      chunks.push(chunk);
    }

    req.on('data', onData);
    req.on('end', () => {
      if (!overflow) resolve(Buffer.concat(chunks).toString('utf8'));
    });
    req.on('error', (err) => {
      if (!overflow) reject(err);
    });
  });
}

/**
 * Read a JSON body from the request.
 *
 * @param {import('http').IncomingMessage} req
 * @param {number} [limit]
 * @returns {Promise<object>}
 * @throws {Error} With code INVALID_JSON if parsing fails
 */
async function readJsonBody(req, limit) {
  const raw = await readBody(req, limit);
  if (!raw || raw.trim().length === 0) return {};
  try {
    return JSON.parse(raw);
  } catch (err) {
    const parseErr = new Error('invalid JSON body');
    parseErr.code = 'INVALID_JSON';
    throw parseErr;
  }
}

module.exports = { readBody, readJsonBody };
