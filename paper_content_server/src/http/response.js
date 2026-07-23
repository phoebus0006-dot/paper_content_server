'use strict';

const JSON_CONTENT_TYPE = 'application/json; charset=utf-8';
const TEXT_CONTENT_TYPE = 'text/plain; charset=utf-8';

/**
 * Check if a response has already been sent (headers flushed).
 * @param {import('http').ServerResponse} res
 * @returns {boolean}
 */
function isFinished(res) {
  return res.headersSent || res.writableEnded || res.destroyed;
}

/**
 * Ensure the response has not been sent yet. If it has, this is a no-op.
 * @param {import('http').ServerResponse} res
 * @returns {boolean} true if still writable
 */
function ensureWritable(res) {
  return !isFinished(res);
}

/**
 * Send a JSON response.
 * @param {import('http').ServerResponse} res
 * @param {number} statusCode
 * @param {*} data
 */
function sendJson(res, statusCode, data) {
  if (!ensureWritable(res)) return;
  const body = Buffer.from(JSON.stringify(data, null, 2));
  res.writeHead(statusCode, {
    'Content-Type': JSON_CONTENT_TYPE,
    'Content-Length': body.length,
  });
  res.end(body);
}

/**
 * Send a plain text response.
 * @param {import('http').ServerResponse} res
 * @param {number} statusCode
 * @param {string} text
 */
function sendText(res, statusCode, text) {
  if (!ensureWritable(res)) return;
  const body = Buffer.from(text);
  res.writeHead(statusCode, {
    'Content-Type': TEXT_CONTENT_TYPE,
    'Content-Length': body.length,
  });
  res.end(body);
}

/**
 * Send a raw Buffer response.
 * @param {import('http').ServerResponse} res
 * @param {number} statusCode
 * @param {Buffer} buffer
 * @param {object} [extraHeaders] - Additional headers to set
 */
function sendBuffer(res, statusCode, buffer, extraHeaders) {
  if (!ensureWritable(res)) return;
  const headers = {
    'Content-Type': 'application/octet-stream',
    'Content-Length': buffer.length,
    ...extraHeaders,
  };
  res.writeHead(statusCode, headers);
  res.end(buffer);
}

/**
 * Send a 204 No Content response.
 * @param {import('http').ServerResponse} res
 */
function sendNoContent(res) {
  if (!ensureWritable(res)) return;
  res.writeHead(204);
  res.end();
}

/**
 * Send a redirect response.
 * @param {import('http').ServerResponse} res
 * @param {number} statusCode - 301, 302, 307, 308
 * @param {string} location
 */
function sendRedirect(res, statusCode, location) {
  if (!ensureWritable(res)) return;
  res.writeHead(statusCode, { Location: location });
  res.end();
}

/**
 * Send an error JSON response.
 * @param {import('http').ServerResponse} res
 * @param {number} statusCode
 * @param {string} message
 */
function sendError(res, statusCode, message) {
  sendJson(res, statusCode, { error: message });
}

module.exports = {
  sendJson,
  sendText,
  sendBuffer,
  sendNoContent,
  sendRedirect,
  sendError,
  isFinished,
};
