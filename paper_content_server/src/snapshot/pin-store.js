// pin-store.js — TTL-based per-client pin with configurable hit/miss TTLs
// HIT_TTL = 29s: used when a snapshot is successfully pinned
// MISS_TTL = 31s: used when pinning a miss (prevents rapid re-computation)

var HIT_TTL_MS = 29000;
var MISS_TTL_MS = 31000;
// 上限：防止恶意客户端用不同 clientKey 无限累积 pin 条目导致 OOM。
// gc() 只清过期项，未过期项可无限增长。超限时淘汰最旧条目（LRU）。
var MAX_PINS = 10000;

function PinStore(clock) {
  clock = clock || { nowMs: function() { return Date.now(); } };
  var pins = new Map();

  function evictIfFull() {
    if (pins.size < MAX_PINS) return;
    // Map 按插入顺序迭代，删最旧的（pinnedAt 最小）
    var oldestKey = null, oldestTime = Infinity;
    pins.forEach(function(entry, key) {
      if (entry.pinnedAt < oldestTime) { oldestTime = entry.pinnedAt; oldestKey = key; }
    });
    if (oldestKey) pins.delete(oldestKey);
  }

  function pin(clientKey, snapshotId) {
    var now = clock.nowMs();
    if (!pins.has(clientKey)) evictIfFull();
    pins.set(clientKey, {
      snapshotId: snapshotId,
      pinnedAt: now,
      expiresAt: now + HIT_TTL_MS,
      hit: true,
    });
  }

  function pinMiss(clientKey) {
    var now = clock.nowMs();
    if (!pins.has(clientKey)) evictIfFull();
    pins.set(clientKey, {
      snapshotId: null,
      pinnedAt: now,
      expiresAt: now + MISS_TTL_MS,
      hit: false,
    });
  }

  function get(clientKey) {
    var entry = pins.get(clientKey);
    if (!entry) return null;
    var now = clock.nowMs();
    if (now > entry.expiresAt) {
      pins.delete(clientKey);
      return null;
    }
    return entry.snapshotId;
  }

  function unpin(clientKey) {
    pins.delete(clientKey);
  }

  function gc() {
    var now = clock.nowMs();
    pins.forEach(function(entry, key) {
      if (now > entry.expiresAt) pins.delete(key);
    });
  }

  function size() {
    return pins.size;
  }

  function clear() {
    pins.clear();
  }

  function setClock(newClock) {
    clock = newClock || { nowMs: function() { return Date.now(); } };
  }

  return {
    pin: pin,
    pinMiss: pinMiss,
    get: get,
    unpin: unpin,
    gc: gc,
    size: size,
    clear: clear,
    setClock: setClock,
  };
}

module.exports = { PinStore: PinStore, HIT_TTL_MS: HIT_TTL_MS, MISS_TTL_MS: MISS_TTL_MS };
