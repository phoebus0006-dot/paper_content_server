'use strict';
const { URL } = require('url');

/**
 * Parse an HTTP request URL into its components.
 *
 * @param {string} rawUrl  - The raw URL string from the request (req.url)
 * @param {string} [host] - The Host header value (for absolute URL resolution)
 * @returns {{ pathname: string, searchParams: URLSearchParams, host: string, href: string }}
 * @throws {TypeError} If the URL is invalid
 */
function parseRequestUrl(rawUrl, host) {
  const base = host ? `http://${host}` : 'http://localhost';
  const parsed = new URL(rawUrl, base);
  return {
    pathname: parsed.pathname,
    searchParams: parsed.searchParams,
    host: parsed.host,
    href: parsed.href,
  };
}

/**
 * Read a query parameter by name from a parsed URL.
 * @param {URLSearchParams} searchParams
 * @param {string} name
 * @returns {string|null}
 */
function getQueryParam(searchParams, name) {
  return searchParams.get(name);
}

module.exports = { parseRequestUrl, getQueryParam };
