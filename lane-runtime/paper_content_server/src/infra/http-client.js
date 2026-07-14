// http-client.js — HTTP fetch abstraction with timeout and error classification

function createHttpClient(defaultTimeoutMs) {
  defaultTimeoutMs = defaultTimeoutMs || 20000;

  function fetchText(url, timeoutMs) {
    timeoutMs = timeoutMs || defaultTimeoutMs;
    var controller = new AbortController();
    var timer = setTimeout(function() { controller.abort(new Error('timeout')); }, timeoutMs);
    return fetch(url, {
      signal: controller.signal,
      headers: {
        'user-agent': 'NewsPhoto_esp32wf/1.0',
        'accept': 'application/rss+xml, application/xml, text/xml, application/json, text/plain;q=0.9, */*;q=0.8',
      },
    }).then(function(response) {
      clearTimeout(timer);
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return response.text();
    }).catch(function(err) {
      clearTimeout(timer);
      if (err.name === 'AbortError') throw new Error('TIMEOUT');
      throw err;
    });
  }

  function fetchJson(url, timeoutMs) {
    return fetchText(url, timeoutMs).then(function(text) {
      return JSON.parse(text);
    });
  }

  return {
    fetchText: fetchText,
    fetchJson: fetchJson,
    defaultTimeoutMs: defaultTimeoutMs,
  };
}

module.exports = { createHttpClient: createHttpClient };
