const http = require('http');
const crypto = require('crypto');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const net = require('net');

var exitCode = 0;
var SRV = path.join(__dirname, '..', 'server.js');
var CWD = path.dirname(SRV);
var TMPDIR = path.join(os.tmpdir(), 'admin-test-' + Date.now());
var PORT = 0;
var BASE;
var TOKEN = 'test-admin-token-abc123';
var passed = 0, failed = 0;

function get(url, token) {
  return new Promise(function(ok, fail) {
    var opts = { hostname: '127.0.0.1', port: PORT, path: url, headers: {} };
    if (token) opts.headers['Authorization'] = 'Bearer ' + token;
    http.get(opts, function(r) {
      var d = []; r.on('data', function(c) { d.push(c); });
      r.on('end', function() { ok({ s: r.statusCode, b: Buffer.concat(d), h: r.headers }); });
    }).on('error', fail);
  });
}

function post(url, body, token) {
  return new Promise(function(ok, fail) {
    var j = JSON.stringify(body);
    var opts = { hostname: '127.0.0.1', port: PORT, path: url, method: 'POST', headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(j) } };
    if (token) opts.headers['Authorization'] = 'Bearer ' + token;
    var req = http.request(opts, function(r) {
      var d = []; r.on('data', function(c) { d.push(c); });
      r.on('end', function() { ok({ s: r.statusCode, b: Buffer.concat(d), h: r.headers }); });
    });
    req.on('error', fail);
    req.end(j);
  });
}

function del(url, token) {
  return new Promise(function(ok, fail) {
    var opts = { hostname: '127.0.0.1', port: PORT, path: url, method: 'DELETE', headers: {} };
    if (token) opts.headers['Authorization'] = 'Bearer ' + token;
    var req = http.request(opts, function(r) {
      var d = []; r.on('data', function(c) { d.push(c); });
      r.on('end', function() { ok({ s: r.statusCode, b: Buffer.concat(d) }); });
    });
    req.on('error', fail);
    req.end();
  });
}

function sha256(b) { return crypto.createHash('sha256').update(b).digest('hex'); }

function makeItem(i) {
  return { source: 'Test', category: 'technology', title: 'Title' + i, summary: 'Test summary item ' + i + '. Long enough for validation.', url: 'http://test' + i + '.com' };
}

var sixItems = [];
for (var gi = 0; gi < 6; gi++) sixItems.push(makeItem(gi + 1));

function check(label, ok, detail) {
  console.log((ok ? 'PASS' : 'FAIL') + ' ' + label + (detail ? ': ' + detail : ''));
  if (ok) passed++; else { failed++; exitCode = 1; }
}

function findFreePort() {
  return new Promise(function(ok, fail) {
    var s = net.createServer();
    s.listen(0, '127.0.0.1', function() {
      var p = s.address().port;
      s.close(function() { ok(p); });
    });
    s.on('error', fail);
  });
}

async function main() {
  PORT = await findFreePort();
  BASE = 'http://127.0.0.1:' + PORT;

  console.log('=== Admin Workflow Test ===\n');
  try { fs.mkdirSync(TMPDIR, { recursive: true }); } catch(e) {}

  var dataSrc = path.join(CWD, 'data');
  var trackedFiles = ['image_index.json', 'raw_index.json', 'news_cache.json', 'library_state.json', 'news_rotation_state.json', 'last_good_news.json'];
  var beforeHashes = {};

  trackedFiles.forEach(function(f) {
    var src = path.join(dataSrc, f);
    if (fs.existsSync(src)) {
      beforeHashes[f] = sha256(fs.readFileSync(src));
      fs.copyFileSync(src, path.join(TMPDIR, f));
    } else {
      beforeHashes[f] = null;
    }
  });

  var env = Object.assign({}, process.env, {
    PORT: String(PORT), TZ: 'Europe/Paris', TRANSLATION_PROVIDER: 'none',
    PHOTO_QUANT_MODE: 'clean', ENABLE_DEBUG_ROUTES: 'true',
    ADMIN_TOKEN: TOKEN, DATA_DIR: TMPDIR,
    FEEDS_FILE: path.join(TMPDIR, 'feeds.json'),
    NEWS_CACHE_FILE: path.join(TMPDIR, 'news_cache.json'),
    LIBRARY_STATE_FILE: path.join(TMPDIR, 'library_state.json'),
    NEWS_ROTATION_FILE: path.join(TMPDIR, 'news_rotation_state.json'),
    IMAGE_INDEX_FILE: path.join(TMPDIR, 'image_index.json'),
    LAST_GOOD_NEWS_FILE: path.join(TMPDIR, 'last_good_news.json'),
    FALLBACK_STUDY_DIR: path.join(TMPDIR, 'fallback_study'),
    RAW_IMAGES_DIR: path.join(TMPDIR, 'raw_images'),
    PROCESSED_IMAGES_DIR: path.join(TMPDIR, 'processed_images'),
    IMPORT_IMAGES_DIR: path.join(TMPDIR, 'import_images'),
    IMAGE_ROOT: path.join(TMPDIR, 'images')
  });

  var server = spawn(process.execPath, [SRV], { env: env, cwd: CWD, stdio: ['ignore', 'pipe', 'pipe'] });
  var ready = false;
  for (var i = 0; i < 60; i++) {
    try { var r = await get('/api/state.json'); if (r.s === 200) { ready = true; break; } } catch(e) {}
    await new Promise(function(r) { setTimeout(r, 2000); });
  }
  if (!ready) { console.log('FAIL: server did not start'); server.kill(); process.exit(1); }

  try {
    console.log('--- AUTH ---');
    check('no token -> 401', (await get('/api/admin/dashboard')).s === 401);
    check('wrong token -> 403', (await get('/api/admin/dashboard', 'wrong')).s === 403);
    check('valid token -> 200', (await get('/api/admin/dashboard', TOKEN)).s === 200);

    console.log('\n--- NEWS DRAFT ---');
    check('1 item -> 400', (await post('/api/admin/news/draft', { items: [makeItem(1)] }, TOKEN)).s >= 400);
    check('valid 6 -> 200', (await post('/api/admin/news/draft', { items: sixItems }, TOKEN)).s === 200);

    console.log('\n--- NEWS REVIEW GATE ---');
    var pub1 = await post('/api/admin/publish/news', {}, TOKEN);
    check('publish before review -> 409', pub1.s === 409, 'status=' + pub1.s);
    var pub1d = JSON.parse(pub1.b.toString());
    check('error code NEWS_REVIEW_REQUIRED', pub1d.error && pub1d.error.code === 'NEWS_REVIEW_REQUIRED');

    var appr = await post('/api/admin/news/draft/approve-all', {}, TOKEN);
    check('approve-all -> 200', appr.s === 200);

    var pubN = await post('/api/admin/publish/news', {}, TOKEN);
    check('publish after review -> 200', pubN.s === 200);
    var pubNd = JSON.parse(pubN.b.toString());
    check('has frameId', pubNd.frameId && pubNd.frameId.length > 5);
    check('frameId is manual-news', pubNd.frameId.indexOf('manual-news:') === 0);
    check('has frameSha256', pubNd.frameSha256 && pubNd.frameSha256.length > 5);

    var fb = await get('/api/frame.bin');
    check('frame 200', fb.s === 200);
    check('frame 192010B', fb.b.length === 192010);
    var pl = fb.b.slice(10);
    var seenCodes = {}, code4 = 0;
    for (var pi = 0; pi < 100; pi++) {
      var hi = (pl[pi] >> 4) & 0x0F, lo = pl[pi] & 0x0F;
      seenCodes[String(hi)] = true; seenCodes[String(lo)] = true;
      if (hi === 4) code4++; if (lo === 4) code4++;
    }
    var allValid = Object.keys(seenCodes).every(function(c) { return ['0','1','2','3','5','6'].indexOf(c) >= 0; });
    check('sample codes valid', allValid && code4 === 0, 'codes=' + Object.keys(seenCodes).join(',') + ' c4=' + code4);

    console.log('\n--- NEWS PUBLISH VERIFICATION ---');
    var st1 = await get('/api/state.json', TOKEN);
    check('state1 200', st1.s === 200);
    var st1d = JSON.parse(st1.b.toString());
    check('state frameId === pub frameId', st1d.frameId === pubNd.frameId);
    // Use a fresh frame.bin fetch after state.json to ensure consistent snapshot
    var fb2v = await get('/api/frame.bin');
    check('state frameId === x-frame-id', st1d.frameId === fb2v.h['x-frame-id']);
    check('frameId starts manual-news:', st1d.frameId.indexOf('manual-news:') === 0);
    check('operatingMode LEGACY_ADMIN_OVERRIDE', st1d.operatingMode === 'LEGACY_ADMIN_OVERRIDE');
    check('state items length 6', st1d.items && st1d.items.length === 6);
    for (var vi = 0; vi < 6; vi++) {
      check('item ' + vi + ' title', st1d.items[vi].originalTitle === sixItems[vi].title || st1d.items[vi].title === sixItems[vi].title);
      check('item ' + vi + ' url', st1d.items[vi].sourceUrl === sixItems[vi].url || st1d.items[vi].url === sixItems[vi].url);
    }

    console.log('\n--- SECOND DRAFT ---');
    var sixItems2 = [];
    for (var s2 = 0; s2 < 6; s2++) {
      var n2 = s2 + 1;
      sixItems2.push({ source: 'AltSource', category: 'science', title: 'SecondTitle' + n2, summary: 'Second summary item ' + n2 + '. Distinct content for validation purposes.', url: 'http://alt' + n2 + '.org' });
    }
    check('draft2 6 -> 200', (await post('/api/admin/news/draft', { items: sixItems2 }, TOKEN)).s === 200);
    check('approve2 -> 200', (await post('/api/admin/news/draft/approve-all', {}, TOKEN)).s === 200);
    var pub2 = await post('/api/admin/publish/news', {}, TOKEN);
    check('pub2 -> 200', pub2.s === 200);
    var pub2d = JSON.parse(pub2.b.toString());
    check('pub2 frameId exists', pub2d.frameId && pub2d.frameId.length > 5);
    check('pub2 frameId !== pub1 frameId', pub2d.frameId !== pubNd.frameId);
    check('pub2 frameSha256 exists', pub2d.frameSha256 && pub2d.frameSha256.length > 5);
    check('pub2 frameSha256 !== pub1 frameSha256', pub2d.frameSha256 !== pubNd.frameSha256);
    var fb2 = await get('/api/frame.bin');
    check('fb2 200', fb2.s === 200);
    check('fb2 size 192010', fb2.b.length === 192010);
    check('fb2 SHA !== fb1 SHA', sha256(fb2.b) !== sha256(fb.b));

    console.log('\n--- NEWS PUBLISH VALIDATION ---');
    var rejAll = await post('/api/admin/news/draft/reject-all', {}, TOKEN);
    check('reject-all -> 200', rejAll.s === 200);
    var pubRej = await post('/api/admin/publish/news', {}, TOKEN);
    check('publish after reject-all -> 409', pubRej.s === 409, 'status=' + pubRej.s);
    var dp = path.join(TMPDIR, 'admin_news_draft.json');
    var d5 = JSON.parse(fs.readFileSync(dp, 'utf8'));
    d5.items = d5.items.slice(0, 5);
    fs.writeFileSync(dp, JSON.stringify(d5, null, 2));
    var pub5 = await post('/api/admin/publish/news', {}, TOKEN);
    check('publish with 5 items -> 400 or 409', pub5.s === 400 || pub5.s === 409, 'status=' + pub5.s);
    var sixItems3 = [];
    for (var s3 = 0; s3 < 6; s3++) sixItems3.push(makeItem(s3 + 10));
    check('draft3 6 -> 200', (await post('/api/admin/news/draft', { items: sixItems3 }, TOKEN)).s === 200);
    check('approve3 -> 200', (await post('/api/admin/news/draft/approve-all', {}, TOKEN)).s === 200);
    var pub3 = await post('/api/admin/publish/news', {}, TOKEN);
    check('publish 6 approved -> 200', pub3.s === 200, 'status=' + pub3.s);

    console.log('\n--- PHOTO ---');
    check('unknown photo', (await post('/api/admin/publish/photo', { photoId: 'nonexistent' }, TOKEN)).s >= 400);

    console.log('\n--- OVERRIDE ---');
    check('clear override', (await del('/api/admin/override', TOKEN)).s < 300);
    var stAfter = await get('/api/state.json', TOKEN);
    var stAfterD = JSON.parse(stAfter.b.toString());
    check('operatingMode AUTO after override', stAfterD.operatingMode === 'AUTO');

    console.log('\n--- ADMIN PAGES ---');
    check('admin page', (await get('/admin/', TOKEN)).s === 200);
    check('admin CSS', (await get('/admin/admin.css', TOKEN)).s === 200);
    check('admin JS', (await get('/admin/admin.js', TOKEN)).s === 200);

    console.log('\n--- DATA INTEGRITY ---');
    trackedFiles.forEach(function(f) {
      var src = path.join(dataSrc, f);
      var afterHash = fs.existsSync(src) ? sha256(fs.readFileSync(src)) : null;
      check('INTEGRITY ' + f + ' unchanged', afterHash === beforeHashes[f]);
    });

  } catch(e) { console.log('ERROR:', e.message); failed++; exitCode = 1; }
  finally {
    server.kill();
    await new Promise(function(r) { server.on('exit', r); setTimeout(r, 1000); });
    try { fs.rmdirSync(TMPDIR, { recursive: true }); } catch(e) {}
    console.log('\n=== Summary: ' + passed + ' passed, ' + failed + ' failed');
    process.exit(exitCode);
  }
}

main().catch(function(e) { console.error('UNCAUGHT:', e.message); process.exit(1); });
