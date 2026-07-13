// wikimedia-source-adapter.js — Wikimedia Commons source adapter
// 从 Wikimedia Commons API 获取 CC 授权的图片候选

var https = require('https');
var http = require('http');
var url = require('url');

function createWikimediaSourceAdapter(config) {
  config = config || {};
  var apiUrl = config.apiUrl || 'https://commons.wikimedia.org/w/api.php';
  var searchTerm = config.searchTerm || 'educational';
  var limit = config.limit || 10;
  var timeout = config.timeout || 10000;
  var maxPages = config.maxPages || 3;

  function fetchAll() {
    return new Promise(function(resolve, reject) {
      var page = 1;
      var all = [];

      function fetchPage(offset) {
        if (page > maxPages) { resolve(all); return; }

        var params = new URLSearchParams({
          action: 'query',
          format: 'json',
          generator: 'search',
          gsrsearch: searchTerm,
          gsrnamespace: 6, // File namespace
          gsrlimit: limit,
          gsroffset: offset,
          prop: 'imageinfo',
          iiprop: 'url|extmetadata|size|mime',
        });

        var targetUrl = apiUrl + '?' + params.toString();
        var parsed = url.parse(targetUrl);
        var protocol = parsed.protocol === 'https:' ? https : http;

        var req = protocol.get({
          hostname: parsed.hostname,
          port: parsed.port ? parseInt(parsed.port, 10) : undefined,
          path: parsed.path,
          headers: { 'User-Agent': 'PaperContentServer/1.0 (educational use)' },
          timeout: timeout,
        }, function(res) {
          // HTTP 状态校验:非 200 立即 reject,不解析正文
          if (res.statusCode !== 200) {
            res.resume();
            reject(new Error('Wikimedia API HTTP ' + res.statusCode));
            return;
          }
          var data = '';
          res.on('data', function(chunk) { data += chunk; });
          res.on('end', function() {
            try {
              var json = JSON.parse(data);
              // API 错误不得吞掉:Wikimedia 返回 { error: { code, info } }
              if (json && json.error) {
                reject(new Error('Wikimedia API error: ' + (json.error.code || 'unknown') + ' ' + (json.error.info || '')));
                return;
              }
              var pages = json.query && json.query.pages ? Object.values(json.query.pages) : [];
              var candidates = pages.map(function(pg) {
                var ii = pg.imageinfo && pg.imageinfo[0];
                if (!ii || !ii.url) return null;
                var extmeta = ii.extmetadata || {};
                var licenseVal = extmeta.LicenseShortName ? extmeta.LicenseShortName.value : null;
                return {
                  // stable ID:基于 pageid,跨调用确定
                  candidateId: 'wm:' + pg.pageid,
                  sourceUrl: ii.url,
                  source: 'wikimedia',
                  title: pg.title,
                  mimeType: ii.mime,
                  width: ii.width,
                  height: ii.height,
                  license: licenseVal,
                  rightsStatus: licenseVal === 'Public domain' ? 'PUBLIC_DOMAIN' : 'PERMITTED',
                  author: extmeta.Artist ? extmeta.Artist.value : null,
                };
              }).filter(Boolean);
              all = all.concat(candidates);
              page++;
              if (candidates.length < limit) { resolve(all); return; }
              fetchPage(offset + limit);
            } catch(e) {
              reject(new Error('Wikimedia API parse error: ' + e.message));
            }
          });
        });

        req.on('error', reject);
        req.on('timeout', function() { req.destroy(); reject(new Error('Wikimedia API timeout')); });
      }

      fetchPage(0);
    });
  }

  return { fetchAll: fetchAll, sourceName: 'wikimedia' };
}

module.exports = { createWikimediaSourceAdapter: createWikimediaSourceAdapter };
