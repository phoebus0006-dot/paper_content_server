#!/usr/bin/env node
// learning-downloader-harden-test.js — downloader 加固测试
// 覆盖:仅 HTTP 200、Content-Type 白名单、Content-Length 预检查、流式字节上限、
//       重定向上限、超时、错误/abort 清理临时文件、拒绝非 HTTPS。
var path = require('path');
var fs = require('fs');
var os = require('os');
var http = require('http');
var ROOT = path.join(__dirname, '..', '..', '..');
var ec = 0, pass = 0, fail = 0;
function t(n, o, d) { console.log((o ? 'PASS' : 'FAIL') + ' ' + n + (d ? ': ' + d : '')); if (o) pass++; else { ec = 1; fail++; } }

var DL = require(path.join(ROOT, 'src', 'learning', 'learning-downloader'));

function mkdtemp(prefix) { return fs.mkdtempSync(path.join(os.tmpdir(), prefix)); }
function rmrf(dir) { try { fs.rmSync(dir, { recursive: true, force: true }); } catch(e) {} }
function stagingCount(dir) { try { return fs.readdirSync(dir).length; } catch(e) { return -1; } }

// 单个 mock 服务器,按路径分发不同行为
function startServer(pngBuf) {
  return new Promise(function(resolve) {
    var server = http.createServer(function(req, res) {
      var u = req.url;
      // /img.png — 200 + image/png
      if (u === '/img.png') {
        res.writeHead(200, { 'Content-Type': 'image/png', 'Content-Length': pngBuf.length });
        res.end(pngBuf);
        return;
      }
      // /imgnotype — 200 但无 Content-Type
      if (u === '/imgnotype') {
        res.writeHead(200, {});
        res.end(pngBuf);
        return;
      }
      // /html.png — 200 + text/html
      if (u === '/html.png') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('<html></html>');
        return;
      }
      // /jpegct — 200 + image/jpeg (白名单内,应接受)
      if (u === '/jpegct') {
        res.writeHead(200, { 'Content-Type': 'image/jpeg' });
        res.end(pngBuf);
        return;
      }
      // /404 — 非 200
      if (u === '/404') { res.writeHead(404, {}); res.end('nf'); return; }
      if (u === '/500') { res.writeHead(500, {}); res.end('err'); return; }
      // /biglen — Content-Length 超限(预检查)
      if (u === '/biglen') {
        res.writeHead(200, { 'Content-Type': 'image/png', 'Content-Length': '999999' });
        res.end(pngBuf);
        return;
      }
      // /streambig — 无 Content-Length,流式写入超过 maxBytes
      if (u === '/streambig') {
        res.writeHead(200, { 'Content-Type': 'image/png' });
        // 分块写入,远超 maxBytes
        var chunk = Buffer.alloc(64, 65); // 'A' * 64
        var sent = 0;
        function sendChunk() {
          if (sent >= 1024) { res.end(); return; }
          res.write(chunk, function() { sent += chunk.length; setImmediate(sendChunk); });
        }
        sendChunk();
        return;
      }
      // /loop/N — 无限重定向链(用于重定向上限测试)
      var m = u.match(/^\/loop\/(\d+)$/);
      if (m) {
        var n = parseInt(m[1], 10);
        res.writeHead(302, { 'Location': '/loop/' + (n + 1) });
        res.end();
        return;
      }
      // /redir → /img.png (单次重定向,验证可正常跟随)
      if (u === '/redir') {
        res.writeHead(302, { 'Location': '/img.png' });
        res.end();
        return;
      }
      // /hang — 不响应(触发 timeout)
      if (u === '/hang') { return; }
      // 默认
      res.writeHead(404, {}); res.end('nf');
    });
    server.listen(0, '127.0.0.1', function() {
      resolve({ server: server, port: server.address().port });
    });
  });
}
function closeServer(s) {
  return new Promise(function(resolve) {
    var done = false;
    function finish() { if (!done) { done = true; resolve(); } }
    s.server.close(finish);
    setTimeout(function() {
      try { s.server.closeAllConnections && s.server.closeAllConnections(); } catch(e) {}
      finish();
    }, 1000);
  });
}

function toErr(p) {
  return p.then(function(v) { return { ok: true, value: v }; }, function(e) { return { ok: false, err: e }; });
}

(async function() {
  // 准备一个真实 PNG(若 sharp 可用)或最小 fixture
  var pngBuf;
  try {
    var sharp = require('sharp');
    pngBuf = await sharp({ create: { width: 8, height: 8, channels: 3, background: { r: 1, g: 2, b: 3 } } }).png().toBuffer();
  } catch(e) {
    pngBuf = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAgAAAAIAQMAAAD+wOnIAAAABlBMVEX///8AAABVct5rAAAAAXRSTlMAQObYZgAAAA5JREFUCNdj+M+ABf9HwMAAAnsBCxgAA3oBslwAAAAASUVORK5CYII=', 'base64');
  }

  var srv = await startServer(pngBuf);
  var base = 'http://127.0.0.1:' + srv.port;
  var staging = mkdtemp('dl-harden-');

  try {
    // --- 1. 200 + image/png 接受 ---
    var d1 = DL.createLearningDownloader(staging, {}, { allowHttp: true });
    var r1 = await toErr(d1.download(base + '/img.png'));
    t('ACCEPT_200_IMAGE', r1.ok, r1.ok ? r1.value : r1.err.message);
    t('ACCEPT_FILE_EXISTS', r1.ok && fs.existsSync(r1.value), '');
    t('ACCEPT_TMP_EXT', r1.ok && path.extname(r1.value) === '.tmp', 'ext=' + (r1.ok ? path.extname(r1.value) : ''));
    if (r1.ok) { d1.cleanup(r1.value); }

    // --- 2. 仅 200 接受:404/500 拒绝 ---
    var d2 = DL.createLearningDownloader(staging, {}, { allowHttp: true });
    var r404 = await toErr(d2.download(base + '/404'));
    t('REJECT_404', !r404.ok && r404.err.message.indexOf('HTTP 404') >= 0, r404.err.message);
    var r500 = await toErr(d2.download(base + '/500'));
    t('REJECT_500', !r500.ok && r500.err.message.indexOf('HTTP 500') >= 0, r500.err.message);
    t('REJECT_NON200_NO_TEMP', stagingCount(staging) === 0, 'staging=' + stagingCount(staging));

    // --- 3. Content-Type 必须是 image/* ---
    var d3 = DL.createLearningDownloader(staging, {}, { allowHttp: true });
    var rhtml = await toErr(d3.download(base + '/html.png'));
    t('REJECT_NON_IMAGE_CT', !rhtml.ok && rhtml.err.message.indexOf('Invalid Content-Type') >= 0, rhtml.err.message);
    t('REJECT_NON_IMAGE_CT_NO_TEMP', stagingCount(staging) === 0, '');
    // 缺失 Content-Type 也应拒绝
    var rnotype = await toErr(d3.download(base + '/imgnotype'));
    t('REJECT_MISSING_CT', !rnotype.ok && rnotype.err.message.indexOf('Invalid Content-Type') >= 0, rnotype.err.message);
    // image/jpeg 在白名单内,应接受
    var rjpeg = await toErr(d3.download(base + '/jpegct'));
    t('ACCEPT_JPEG_CT', rjpeg.ok, rjpeg.ok ? 'ok' : rjpeg.err.message);
    if (rjpeg.ok) { d3.cleanup(rjpeg.value); }

    // --- 4. Content-Length 预检查 ---
    var d4 = DL.createLearningDownloader(staging, {}, { allowHttp: true, maxDownloadBytes: 64 });
    var rlen = await toErr(d4.download(base + '/biglen'));
    t('REJECT_CONTENT_LENGTH_PRECHECK', !rlen.ok && rlen.err.message.indexOf('Content-Length exceeds limit') >= 0, rlen.err.message);
    t('REJECT_CONTENT_LENGTH_NO_TEMP', stagingCount(staging) === 0, '');

    // --- 5. 流式字节上限(无 Content-Length) ---
    var d5 = DL.createLearningDownloader(staging, {}, { allowHttp: true, maxDownloadBytes: 64 });
    var rstream = await toErr(d5.download(base + '/streambig'));
    t('REJECT_STREAM_LIMIT', !rstream.ok && rstream.err.message.indexOf('Stream exceeded limit') >= 0, rstream.err.message);
    t('REJECT_STREAM_LIMIT_CLEANED', stagingCount(staging) === 0, 'staging=' + stagingCount(staging));

    // --- 6. 重定向上限(6+ 跳 → Too many redirects) ---
    var d6 = DL.createLearningDownloader(staging, {}, { allowHttp: true });
    var rloop = await toErr(d6.download(base + '/loop/0'));
    t('REJECT_REDIRECT_LIMIT', !rloop.ok && rloop.err.message.indexOf('Too many redirects') >= 0, rloop.err.message);
    t('REJECT_REDIRECT_LIMIT_NO_TEMP', stagingCount(staging) === 0, '');

    // --- 7. 单次重定向可正常跟随(验证上限逻辑没有破坏正常重定向) ---
    var d7 = DL.createLearningDownloader(staging, {}, { allowHttp: true });
    var rredir = await toErr(d7.download(base + '/redir'));
    t('REDIRECT_FOLLOWED_OK', rredir.ok, rredir.ok ? rredir.value : rredir.err.message);
    if (rredir.ok) { d7.cleanup(rredir.value); }

    // --- 8. 超时 ---
    var d8 = DL.createLearningDownloader(staging, {}, { allowHttp: true, timeout: 300 });
    var rto = await toErr(d8.download(base + '/hang'));
    t('REJECT_TIMEOUT', !rto.ok && rto.err.message.indexOf('Download timeout') >= 0, rto.err.message);
    t('REJECT_TIMEOUT_NO_TEMP', stagingCount(staging) === 0, '');

    // --- 9. 拒绝非 HTTPS(allowHttp=false 默认) ---
    var d9 = DL.createLearningDownloader(staging, {});
    var rhttp = await toErr(d9.download(base + '/img.png'));
    t('REJECT_NON_HTTPS', !rhttp.ok && rhttp.err.message.indexOf('Non-HTTPS not allowed') >= 0, rhttp.err.message);
    t('REJECT_NON_HTTPS_NO_TEMP', stagingCount(staging) === 0, '');

    // --- 10. 非法协议 ---
    var d10 = DL.createLearningDownloader(staging, {}, { allowHttp: true });
    var rbad = await toErr(d10.download('ftp://x/y'));
    t('REJECT_INVALID_PROTOCOL', !rbad.ok && rbad.err.message.indexOf('Invalid URL protocol') >= 0, rbad.err.message);

    // --- 11. 常量导出 ---
    t('CONST_MAX_DOWNLOAD_BYTES', DL.DEFAULT_MAX_DOWNLOAD_BYTES === 20 * 1024 * 1024, '' + DL.DEFAULT_MAX_DOWNLOAD_BYTES);
    t('CONST_MAX_REDIRECTS', DL.MAX_REDIRECTS === 5, '' + DL.MAX_REDIRECTS);
    t('CONST_ALLOWED_CT_LEN', Array.isArray(DL.ALLOWED_IMAGE_CONTENT_TYPES) && DL.ALLOWED_IMAGE_CONTENT_TYPES.length === 3, '');
  } finally {
    await closeServer(srv);
    rmrf(staging);
  }

  console.log('\n=== Summary: ' + pass + ' passed, ' + fail + ' failed ===');
  process.exit(ec);
})();
