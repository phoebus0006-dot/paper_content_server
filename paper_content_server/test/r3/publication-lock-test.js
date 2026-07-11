#!/usr/bin/env node
// R3.3a: PublicationLock — single-process serialization lock

var path = require('path');
var ROOT = path.join(__dirname, '..', '..');
var ec = 0, pass = 0, fail = 0;
function t(n,o,d){console.log((o?'PASS':'FAIL')+' '+n+(d?': '+d:''));if(o)pass++;else{ec=1;fail++}}

var PublicationLock = require(path.join(ROOT, 'src', 'publication', 'publication-lock')).PublicationLock;

var lock = PublicationLock();
t('LOCK_EXISTS', typeof lock.acquire === 'function', '');

async function run() {
  // 1. Basic acquire/release
  var release1 = await lock.acquire('test');
  t('RELEASE_FN', typeof release1 === 'function', '');
  release1();

  // 2. Serialization: two acquires on same key run sequentially
  var order = [];
  var p1 = lock.acquire('serial').then(function(release) {
    order.push(1);
    return new Promise(function(resolve) {
      setTimeout(function() {
        order.push(2);
        release();
        resolve();
      }, 50);
    });
  });
  var p2 = lock.acquire('serial').then(function(release) {
    order.push(3);
    release();
  });
  await Promise.all([p1, p2]);
  t('SERIALIZED', order[0] === 1 && order[1] === 2 && order[2] === 3, 'order=' + JSON.stringify(order));

  // 3. Different keys run in parallel
  var parallelOrder = [];
  var pk1 = lock.acquire('key-a').then(function(release) {
    parallelOrder.push('a-start');
    return new Promise(function(resolve) {
      setTimeout(function() {
        parallelOrder.push('a-end');
        release();
        resolve();
      }, 50);
    });
  });
  var pk2 = lock.acquire('key-b').then(function(release) {
    parallelOrder.push('b-start');
    release();
    parallelOrder.push('b-end');
  });
  await Promise.all([pk1, pk2]);
  t('PARALLEL_KEYS', parallelOrder.indexOf('b-start') < parallelOrder.indexOf('a-end'), 'order=' + JSON.stringify(parallelOrder));

  // 4. Default key
  var releaseD = await lock.acquire();
  t('DEFAULT_KEY', typeof releaseD === 'function', '');
  releaseD();

  console.log('\n=== Summary: ' + pass + ' passed, ' + fail + ' failed ===');
  process.exit(ec);
}

run().catch(function(err) {
  console.log('CRASH: ' + err.message);
  process.exit(1);
});
