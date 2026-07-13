// learning-source-registry.js — Registry of available source adapters/ports
function createSourceRegistry() {
  var sources = {};

  function register(nameOrAdapter, port) {
    var name, adapter;
    if (typeof nameOrAdapter === 'string') {
      // Legacy form: register(name, port)
      name = nameOrAdapter;
      adapter = port || { fetchCandidates: function() { return Promise.resolve([]); } };
    } else if (nameOrAdapter && typeof nameOrAdapter === 'object') {
      // Adapter form: register(adapter) — adapter exposes sourceName + fetchAll
      adapter = nameOrAdapter;
      name = adapter.sourceName || adapter.name || 'unknown';
    } else {
      return;
    }
    sources[name] = adapter;
  }

  function unregister(sourceName) {
    if (sources.hasOwnProperty(sourceName)) {
      delete sources[sourceName];
      return true;
    }
    return false;
  }

  function get(name) { return sources[name] || null; }

  function list() { return Object.keys(sources); }

  function fetchAll() {
    return Promise.all(Object.keys(sources).map(function(k) {
      var src = sources[k];
      // Prefer the real adapter's fetchAll; fall back to legacy fetchCandidates
      if (typeof src.fetchAll === 'function') return src.fetchAll();
      if (typeof src.fetchCandidates === 'function') return src.fetchCandidates();
      return Promise.resolve([]);
    }));
  }

  return { register: register, unregister: unregister, get: get, list: list, fetchAll: fetchAll };
}
module.exports = { createSourceRegistry: createSourceRegistry };
