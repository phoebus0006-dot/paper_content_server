#!/usr/bin/env node
// wikimedia-source-adapter-test.js — mock HTTP server tests for Wikimedia adapter
var path = require('path');
var http = require('http');
var ROOT = path.join(__dirname, '..', '..', '..');
var ec = 0, pass = 0, fail = 0;
function t(n, o, d) { console.log((o ? 'PASS' : 'FAIL') + ' ' + n + (d ? ': ' + d : '')); if (o) pass++; else { ec = 1; fail++; } }

var WM = require(path.join(ROOT, 'src', 'learning', 'wikimedia-source-adapter'));

function startServer(handler) {
  return new Promise(function(resolve) {
    var server = http.createServer(function(req, res) {
      handler(req, res);
    });
    server.listen(0, '127.0.0.1', function() {
      var port = server.address().port;
      resolve({ server: server, port: port, url: 'http://127.0.0.1:' + port + '/w/api.php' });
    });
  });
}

function closeServer(s) {
  return new Promise(function(resolve) { s.server.close(function() { resolve(); }); });
}

function buildPage(pageid, title, license, imgUrl, mime, w, h) {
  var page = {
    pageid: pageid,
    title: title,
    ns: 6,
    imageinfo: [{
      url: imgUrl,
      mime: mime || 'image/jpeg',
      width: w || 800,
      height: h || 600,
      extmetadata: {},
    }],
  };
  if (license) page.imageinfo[0].extmetadata.LicenseShortName = { value: license };
  if (license === 'ArtistName') page.imageinfo[0].extmetadata.Artist = { value: 'TestArtist' };
  return page;
}

function apiResponse(pagesArr, hasContinue) {
  var pages = {};
  pagesArr.forEach(function(p) { pages[p.pageid] = p; });
  var body = { query: { pages: pages } };
  if (hasContinue) body['continue'] = { gsroffset: 999, continue: '||' };
  return JSON.stringify(body);
}

(async function() {
  // --- Scenario 1: single page, license mapping, source URL, stable candidate ID ---
  var s1 = await startServer(function(req, res) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(apiResponse([
      buildPage(111, 'File:photo1.jpg', 'CC BY 4.0', 'https://upload.example.com/p1.jpg'),
      buildPage(222, 'File:photo2.jpg', 'Public domain', 'https://upload.example.com/p2.jpg'),
    ], false));
  });
  try {
    var adapter = WM.createWikimediaSourceAdapter({ apiUrl: s1.url, limit: 10, maxPages: 3 });
    t('ADAPTER_SOURCE_NAME', adapter.sourceName === 'wikimedia', 'sourceName');
    var list = await adapter.fetchAll();
    t('FETCH_ALL_LENGTH', list.length === 2, 'got ' + list.length);
    t('CANDIDATE_ID_STABLE', list[0].candidateId === 'wm:111', list[0].candidateId);
    t('CANDIDATE_ID_SECOND', list[1].candidateId === 'wm:222', list[1].candidateId);
    t('SOURCE_URL_P1', list[0].sourceUrl === 'https://upload.example.com/p1.jpg', list[0].sourceUrl);
    t('SOURCE_FIELD', list[0].source === 'wikimedia', list[0].source);
    // license mapping: CC BY 4.0 -> not Public domain -> PERMITTED
    t('RIGHTS_PERMITTED', list[0].rightsStatus === 'PERMITTED', list[0].rightsStatus);
    t('LICENSE_PASSED_THROUGH', list[0].license === 'CC BY 4.0', list[0].license);
    // license mapping: Public domain -> PUBLIC_DOMAIN
    t('RIGHTS_PUBLIC_DOMAIN', list[1].rightsStatus === 'PUBLIC_DOMAIN', list[1].rightsStatus);
    t('LICENSE_PUBLIC_DOMAIN', list[1].license === 'Public domain', list[1].license);
    t('TITLE_PASSED', list[0].title === 'File:photo1.jpg', list[0].title);
    t('MIME_PASSED', list[0].mimeType === 'image/jpeg', list[0].mimeType);
    t('DIMENSIONS_PASSED', list[0].width === 800 && list[0].height === 600, list[0].width + 'x' + list[0].height);
  } finally { await closeServer(s1); }

  // --- Scenario 2: pagination until < limit (natural stop) ---
  var calls2 = [];
  var s2 = await startServer(function(req, res) {
    var u = new URL('http://x' + req.url);
    var offset = parseInt(u.searchParams.get('gsroffset') || '0', 10);
    calls2.push(offset);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    if (offset === 0) res.end(apiResponse([buildPage(1, 'a', 'CC0', 'u1'), buildPage(2, 'b', 'CC0', 'u2')], true));
    else if (offset === 2) res.end(apiResponse([buildPage(3, 'c', 'CC0', 'u3'), buildPage(4, 'd', 'CC0', 'u4')], true));
    else res.end(apiResponse([buildPage(5, 'e', 'CC0', 'u5')], false));
  });
  try {
    var adapter2 = WM.createWikimediaSourceAdapter({ apiUrl: s2.url, limit: 2, maxPages: 5 });
    var list2 = await adapter2.fetchAll();
    t('PAGINATION_TOTAL', list2.length === 5, 'got ' + list2.length);
    t('PAGINATION_OFFSETS', calls2.length === 3 && calls2[0] === 0 && calls2[1] === 2 && calls2[2] === 4, JSON.stringify(calls2));
    t('PAGINATION_STOPPED_AT_SHORT_PAGE', calls2.length === 3, 'stopped after short page');
  } finally { await closeServer(s2); }

  // --- Scenario 3: maxPages cap (each page returns exactly `limit`) ---
  var calls3 = [];
  var s3 = await startServer(function(req, res) {
    var u = new URL('http://x' + req.url);
    var offset = parseInt(u.searchParams.get('gsroffset') || '0', 10);
    calls3.push(offset);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    // always return `limit` candidates so it never stops short
    var off = offset;
    res.end(apiResponse([buildPage(off + 1, 'x' + off, 'CC0', 'u' + off), buildPage(off + 2, 'y' + off, 'CC0', 'v' + off)], true));
  });
  try {
    var adapter3 = WM.createWikimediaSourceAdapter({ apiUrl: s3.url, limit: 2, maxPages: 3 });
    var list3 = await adapter3.fetchAll();
    // maxPages=3 means 3 pages fetched (each with `limit`=2 candidates) -> 6 total, then stopped by cap
    t('MAXPAGES_TOTAL', list3.length === 6, 'got ' + list3.length);
    t('MAXPAGES_FETCH_COUNT', calls3.length === 3, 'fetched ' + calls3.length + ' pages, expected 3 (maxPages cap)');
    t('MAXPAGES_OFFSETS', calls3[0] === 0 && calls3[1] === 2 && calls3[2] === 4, JSON.stringify(calls3));
  } finally { await closeServer(s3); }

  // --- Scenario 4: empty result ---
  var s4 = await startServer(function(req, res) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ query: { pages: {} } }));
  });
  try {
    var adapter4 = WM.createWikimediaSourceAdapter({ apiUrl: s4.url });
    var list4 = await adapter4.fetchAll();
    t('EMPTY_RESULT', Array.isArray(list4) && list4.length === 0, 'got ' + list4.length);
  } finally { await closeServer(s4); }

  // --- Scenario 5: missing imageinfo is skipped (filter Boolean) ---
  var s5 = await startServer(function(req, res) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    var pages = {
      10: { pageid: 10, title: 'File:good.jpg', ns: 6, imageinfo: [{ url: 'http://g.jpg', mime: 'image/jpeg', width: 1, height: 1, extmetadata: {} }] },
      11: { pageid: 11, title: 'File:noinfo.jpg', ns: 6 }, // no imageinfo -> filtered out
    };
    res.end(JSON.stringify({ query: { pages: pages } }));
  });
  try {
    var adapter5 = WM.createWikimediaSourceAdapter({ apiUrl: s5.url });
    var list5 = await adapter5.fetchAll();
    t('MISSING_IMAGEINFO_FILTERED', list5.length === 1 && list5[0].candidateId === 'wm:10', 'got ' + list5.length);
  } finally { await closeServer(s5); }

  // --- Scenario 6: timeout ---
  var s6 = await startServer(function(req, res) {
    // never respond -> triggers timeout
  });
  try {
    var adapter6 = WM.createWikimediaSourceAdapter({ apiUrl: s6.url, timeout: 200, maxPages: 1 });
    var threw = false, errMsg = '';
    try { await adapter6.fetchAll(); } catch(e) { threw = true; errMsg = e.message; }
    t('TIMEOUT_REJECTS', threw, 'did not throw');
    t('TIMEOUT_MESSAGE', errMsg.indexOf('timeout') >= 0, errMsg);
  } finally { await closeServer(s6); }

  // --- Scenario 7: stable candidate ID is deterministic per pageid ---
  var s7 = await startServer(function(req, res) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(apiResponse([buildPage(98765, 'File:stable.jpg', 'CC0', 'http://stable.jpg')], false));
  });
  try {
    var adapter7 = WM.createWikimediaSourceAdapter({ apiUrl: s7.url });
    var a = await adapter7.fetchAll();
    var b = await adapter7.fetchAll();
    t('STABLE_ID_ACROSS_CALLS', a[0].candidateId === b[0].candidateId && a[0].candidateId === 'wm:98765', a[0].candidateId);
  } finally { await closeServer(s7); }

  console.log('\n=== Summary: ' + pass + ' passed, ' + fail + ' failed ===');
  process.exit(ec);
})();
