var http = require('http');
var path = require('path');
var fs = require('fs');
var { spawn } = require('child_process');
var ROOT = path.join(__dirname, '..', '..');
var PORT = 8894;
var MOCK_RSS_PORT = 8895;
var TMPDIR = path.join(ROOT, 'test_news_sync_' + Date.now());
var passed = 0, failed = 0, exitCode = 0;

function check(label, cond) { if (cond) { passed++; console.log('PASS', label) } else { failed++; exitCode = 1; console.log('FAIL', label) } }

function get(url) {
  return new Promise(function(ok) {
    http.get({ hostname: '127.0.0.1', port: PORT, path: url, headers: { 'origin': 'http://127.0.0.1:' + PORT, 'referer': 'http://127.0.0.1:' + PORT + '/admin/' } }, function(r) {
      var d = []; r.on('data', function(c) { d.push(c); }); r.on('end', function() { ok({ s: r.statusCode, b: Buffer.concat(d).toString(), h: r.headers }); });
    }).on('error', function(e) { ok({ s: 0, b: null, err: e }); });
  });
}

function post(url, body) {
  return new Promise(function(ok) {
    var j = JSON.stringify(body || {});
    var opts = { hostname: '127.0.0.1', port: PORT, path: url, method: 'POST', headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(j), 'origin': 'http://127.0.0.1:' + PORT, 'referer': 'http://127.0.0.1:' + PORT + '/admin/' } };
    var r = http.request(opts, function(r) { var d = []; r.on('data', function(c) { d.push(c); }); r.on('end', function() { ok({ s: r.statusCode, b: Buffer.concat(d).toString(), h: r.headers }); }); });
    r.end(j); r.on('error', function(e) { ok({ s: 0, b: null, err: e }); });
  });
}

async function waitForServer() {
  for (var i = 0; i < 30; i++) { try { var r = await get('/health/live'); if (r.s === 200) return true; } catch(e) {} await new Promise(function(r) { setTimeout(r, 1000); }); }
  return false;
}

var mockRssState = 'good'; // 'good', 'empty', 'error'
var mockRssServer = http.createServer(function(req, res) {
  if (mockRssState === 'error') {
    res.writeHead(500); res.end('Internal Server Error'); return;
  }
  if (mockRssState === 'empty') {
    res.writeHead(200, {'Content-Type': 'text/xml'});
    res.end('<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>Empty</title></channel></rss>'); return;
  }
  var pubDate = new Date().toUTCString();
  var p = req.url.replace(/[^a-zA-Z0-9]/g, '');
  res.writeHead(200, {'Content-Type': 'text/xml'});
  res.end('<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>Mock News ' + p + '</title>' +
    '<item><title>' + p + '苹果发布新款令人惊叹的产品</title><link>http://mock/' + p + '/1</link><description>这是一个非常详细的描述内容，长度超过十个字符。</description><pubDate>' + pubDate + '</pubDate></item>' +
    '<item><title>' + p + '利好消息后全球市场大幅上涨</title><link>http://mock/' + p + '/2</link><description>这是一个非常详细的描述内容，长度超过十个字符。</description><pubDate>' + pubDate + '</pubDate></item>' +
    '<item><title>' + p + '科学家发现罕见的水下新物种</title><link>http://mock/' + p + '/3</link><description>这是一个非常详细的描述内容，长度超过十个字符。</description><pubDate>' + pubDate + '</pubDate></item>' +
    '<item><title>' + p + '本地体育队伍赢得冠军争夺战</title><link>http://mock/' + p + '/4</link><description>这是一个非常详细的描述内容，长度超过十个字符。</description><pubDate>' + pubDate + '</pubDate></item>' +
    '<item><title>' + p + '可再生能源技术取得重大突破</title><link>http://mock/' + p + '/5</link><description>这是一个非常详细的描述内容，长度超过十个字符。</description><pubDate>' + pubDate + '</pubDate></item>' +
    '<item><title>' + p + '著名艺术家在市中心开设画廊</title><link>http://mock/' + p + '/6</link><description>这是一个非常详细的描述内容，长度超过十个字符。</description><pubDate>' + pubDate + '</pubDate></item>' +
    '</channel></rss>');
});

async function main() {
  console.log('=== Content Pipeline News Sync Test ===');
  try { fs.mkdirSync(TMPDIR, { recursive: true }); } catch(e) {}
  
  // Create mock feeds.json
  var feedsFile = path.join(TMPDIR, 'feeds.json');
  fs.writeFileSync(feedsFile, JSON.stringify([
    { id: "mock-feed-1", url: "http://127.0.0.1:" + MOCK_RSS_PORT + "/rss1", source: "Mock1", category: "news", country: "CN", language: "zh" },
    { id: "mock-feed-2", url: "http://127.0.0.1:" + MOCK_RSS_PORT + "/rss2", source: "Mock2", category: "news", country: "CN", language: "zh" },
    { id: "mock-feed-3", url: "http://127.0.0.1:" + MOCK_RSS_PORT + "/rss3", source: "Mock3", category: "news", country: "CN", language: "zh" }
  ]));
  
  // Start mock RSS
  await new Promise(r => mockRssServer.listen(MOCK_RSS_PORT, '127.0.0.1', r));

  var env = Object.assign({}, process.env, { PORT: String(PORT), ADMIN_ACCESS_MODE: 'lan', ADMIN_ALLOWED_CIDRS: '127.0.0.0/8', TRUST_PROXY: 'false', DATA_DIR: TMPDIR, TRANSLATION_PROVIDER: 'none', TZ: 'UTC', MQTT_ENABLED: 'false', FEEDS_FILE: feedsFile });
  var server = spawn(process.execPath, [path.join(ROOT, 'server.js')], { env: env, cwd: ROOT, stdio: ['ignore', 'inherit', 'inherit'] });
  
  if (!await waitForServer()) { console.log('FAIL: server did not start'); server.kill(); mockRssServer.close(); process.exit(1); }
  
  // Test 1: Successful sync
  console.log('-- Testing Successful News Sync --');
  var req1 = await post('/api/admin/content-sync/news');
  check('NEWS_SYNC_POST_200', req1.s === 200);
  await new Promise(r => setTimeout(r, 2000)); // wait for job
  
  var statusReq = await get('/api/admin/content-sync/status');
  var status1 = JSON.parse(statusReq.b);
  check('NEWS_SYNC_SUCCESS_RECORDED', status1.news.lastSuccessAt > 0 && status1.news.itemsFetched > 0);
  
  var newsReq = await get('/api/admin/news');
  var newsData = JSON.parse(newsReq.b);
  console.log('newsData:', JSON.stringify(newsData, null, 2));
  check('NEWS_CONTENT_WRITTEN', newsData.selected && newsData.selected.length > 0 && newsData.selected[0].source.startsWith('Mock'));
  
  // Test 2: Failure preserves data
  console.log('-- Testing Failure Preserves Data --');
  mockRssState = 'error';
  var req2 = await post('/api/admin/content-sync/news');
  await new Promise(r => setTimeout(r, 2000));
  
  var statusReq2 = await get('/api/admin/content-sync/status');
  var status2 = JSON.parse(statusReq2.b);
  
  var newsReq2 = await get('/api/admin/news');
  var newsData2 = JSON.parse(newsReq2.b);
  check('NEWS_CONTENT_PRESERVED', newsData2.selected && newsData2.selected.length > 0 && newsData2.selected[0].source.startsWith('Mock'));
  
  server.kill();
  mockRssServer.close();
  try { fs.rmSync(TMPDIR, { recursive: true, force: true }); } catch(e) {}
  console.log('Done: ' + passed + ' passed, ' + failed + ' failed');
  process.exit(exitCode);
}

main().catch(e => { console.error(e); process.exit(1); });
