// publication-lock.js — Single-process serialization lock using promise chaining

function PublicationLock() {
  var locks = {};

  function acquire(key) {
    key = key || '_default';
    var prev = locks[key] || Promise.resolve();
    var release;
    locks[key] = new Promise(function(resolve) {
      release = resolve;
    });
    return prev.then(function() {
      return release;
    });
  }

  return {
    acquire: acquire,
  };
}

module.exports = { PublicationLock: PublicationLock };
