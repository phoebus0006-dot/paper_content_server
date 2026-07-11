// snapshot-cache.js — In-memory snapshot cache with optional LRU eviction

function SnapshotCache(maxSize) {
  maxSize = maxSize || 32;
  var cache = new Map();

  function get(snapshotId) {
    var entry = cache.get(snapshotId);
    if (!entry) return null;
    return entry.snapshot;
  }

  function set(snapshotId, snapshot) {
    if (cache.has(snapshotId)) {
      cache.delete(snapshotId);
    } else if (cache.size >= maxSize) {
      var oldest = cache.keys().next().value;
      cache.delete(oldest);
    }
    cache.set(snapshotId, { snapshot: snapshot });
  }

  function has(snapshotId) {
    return cache.has(snapshotId);
  }

  function del(snapshotId) {
    cache.delete(snapshotId);
  }

  function clear() {
    cache.clear();
  }

  function size() {
    return cache.size;
  }

  function keys() {
    return Array.from(cache.keys());
  }

  return {
    get: get,
    set: set,
    has: has,
    delete: del,
    clear: clear,
    size: size,
    keys: keys,
  };
}

module.exports = { SnapshotCache: SnapshotCache };
