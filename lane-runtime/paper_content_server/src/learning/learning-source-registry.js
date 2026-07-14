// learning-source-registry.js — Registry of available source ports
function createSourceRegistry() {
  var sources = {};
  function register(name, port) { sources[name] = port; }
  function get(name) { return sources[name] || null; }
  function list() { return Object.keys(sources); }
  function fetchAll() {
    return Promise.all(Object.keys(sources).map(function(k) { return sources[k].fetchCandidates(); }));
  }
  return { register: register, get: get, list: list, fetchAll: fetchAll };
}
module.exports = { createSourceRegistry: createSourceRegistry };
