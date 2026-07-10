// Admin routes module for paper_content_server
// Loaded by server.js — all routes prefixed with /api/admin/ or /admin/
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');

var ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';

function isAuthorized(req) {
  if (!ADMIN_TOKEN) return false;
  var auth = req.headers['authorization'] || '';
  return auth === 'Bearer ' + ADMIN_TOKEN;
}

function serveFile(name) {
  var f = path.join(__dirname, 'public', 'admin', name);
  if (fs.existsSync(f)) return fs.readFileSync(f);
  return null;
}

function readJson(p) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch(e) { return null; } }

function readBody(req, limit) {
  return new Promise(function(resolve, reject) {
    var chunks = [], total = 0;
    req.on('data', function(c) { total += c.length; if (limit && total > limit) { req.destroy(); reject(new Error('too large')); return; } chunks.push(c); });
    req.on('end', function() { resolve(Buffer.concat(chunks).toString('utf8')); });
    req.on('error', reject);
  });
}

function readPublishHistory(dataDir) {
  try {
    var f = path.join(dataDir, 'publish_history.json');
    if (!fs.existsSync(f)) return [];
    return JSON.parse(fs.readFileSync(f, 'utf8'));
  } catch(e) { return []; }
}

function respond(res, data) {
  var b = Buffer.from(JSON.stringify(data, null, 2));
  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': b.length });
  res.end(b);
}

function fail(res, code, msg) { var b = Buffer.from(JSON.stringify({ error: msg })); res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(b); }

async function handleAdmin(req, res, parsed, runtime, DATA_DIR, TIMEZONE, FRAME_WIDTH, FRAME_HEIGHT) {
  var p = parsed.pathname;

  // Static admin files
  if (p === '/admin' || p === '/admin/') {
    var html = serveFile('index.html');
    if (html) { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(html); }
    else { res.writeHead(500); res.end('Admin page not found'); }
    return true;
  }
  if (p.startsWith('/admin/') && p.endsWith('.css')) {
    var f = serveFile('admin.css'); if (f) { res.writeHead(200, { 'Content-Type': 'text/css' }); res.end(f); } else { res.writeHead(404); res.end(); }
    return true;
  }
  if (p.startsWith('/admin/') && p.endsWith('.js')) {
    var f = serveFile('admin.js'); if (f) { res.writeHead(200, { 'Content-Type': 'application/javascript' }); res.end(f); } else { res.writeHead(404); res.end(); }
    return true;
  }

  // Auth check for API routes
  if (!isAuthorized(req)) {
    if (!ADMIN_TOKEN) return fail(res, 401, 'ADMIN_TOKEN not configured');
    return fail(res, 403, 'forbidden');
  }

  try {
    if (p === '/api/admin/dashboard') {
      var content = runtime.cachedFrames.size > 0 ? Array.from(runtime.cachedFrames.values())[0] : null;
      var snap = content ? content.snapshot : null;
      var override = readJson(path.join(DATA_DIR, 'admin_override.json')) || {};
      respond(res, {
        status: 'ok', timezone: TIMEZONE, currentMode: snap ? snap.mode : 'unknown', currentSlot: snap ? snap.slotKey : '',
        frameId: snap ? snap.frameId : '', nextSwitchLocal: snap ? snap.nextSwitchLocal : '',
        newsItemCount: 6, frameCacheEntries: runtime.cachedFrames.size,
        uptimeSeconds: Math.floor((Date.now() - runtime.serverStartTime) / 1000),
        frameRenderCount: runtime.renderCount,
        manualOverride: override.mode || 'auto', overrideExpiresAt: override.expiresAt || null, lastPublishedAt: null,
      });
      return true;
    }

    if (p === '/api/admin/news') {
      var selected = [];
      try {
        var now = new Date();
        var key = 'news:' + now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0') + '-' + String(now.getDate()).padStart(2,'0') + ':' + Math.floor(now.getTime() / 900000);
        var cached = runtime.cachedSnapshots.get(key);
        if (cached && cached.items) selected = cached.items.map(function(item) {
          return { source: item.source, category: item.category, title: item.zhTitle, summary: item.zhSummary, url: item.sourceUrl, titleLen: (item.zhTitle||'').length, summaryLen: (item.zhSummary||'').length, translationStatus: item.translationStatus };
        });
      } catch(e) {}
      respond(res, { selected: selected, candidates: [] });
      return true;
    }

    if (p === '/api/admin/news/draft') {
      var data = JSON.parse(await readBody(req));
      fs.writeFileSync(path.join(DATA_DIR, 'admin_news_draft.json'), JSON.stringify(data, null, 2));
      respond(res, { status: 'ok' });
      return true;
    }

    if (p === '/api/admin/publish/news') {
      var overridePath = path.join(DATA_DIR, 'admin_override.json');
      fs.writeFileSync(overridePath, JSON.stringify({ mode: 'manual-news', createdAt: new Date().toISOString(), expiresAt: null }, null, 2));
      var frameId = 'manual-news:' + Date.now().toString(36);
      var hist = readPublishHistory(DATA_DIR);
      hist.unshift({ id: Date.now().toString(36), type: 'news', frameId: frameId, publishedAt: new Date().toISOString(), expiresAt: null, status: 'active' });
      if (hist.length > 100) hist.length = 100;
      fs.writeFileSync(path.join(DATA_DIR, 'publish_history.json'), JSON.stringify(hist, null, 2));
      respond(res, { frameId: frameId });
      return true;
    }

    if (p === '/api/admin/publish/photo') {
      var body2 = JSON.parse(await readBody(req));
      var frameId2 = 'manual-photo:' + Date.now().toString(36);
      fs.writeFileSync(path.join(DATA_DIR, 'admin_override.json'), JSON.stringify({ mode: 'manual-photo', createdAt: new Date().toISOString(), expiresAt: null }, null, 2));
      var hist2 = readPublishHistory(DATA_DIR);
      hist2.unshift({ id: Date.now().toString(36), type: 'photo', sourceId: body2.photoId || null, frameId: frameId2, publishedAt: new Date().toISOString(), expiresAt: null, status: 'active' });
      if (hist2.length > 100) hist2.length = 100;
      fs.writeFileSync(path.join(DATA_DIR, 'publish_history.json'), JSON.stringify(hist2, null, 2));
      respond(res, { frameId: frameId2 });
      return true;
    }

    if (p === '/api/admin/photos') {
      var idx;
      try { idx = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'image_index.json'), 'utf8')); } catch(e) { idx = []; }
      var photos = (idx || []).map(function(e) { return { id: e.id, title: e.title, source: e.source, width: e.width, height: e.height, theme: e.theme, createdAt: e.createdAt }; });
      respond(res, { photos: photos });
      return true;
    }

    if (p.startsWith('/api/admin/photos/') && p.endsWith('/thumbnail')) {
      var id = p.split('/')[4];
      var idx3; try { idx3 = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'image_index.json'), 'utf8')); } catch(e) { idx3 = []; }
      var entry = idx3.filter(function(e) { return e.id === id; });
      if (entry.length > 0 && entry[0].processedPngPath && fs.existsSync(entry[0].processedPngPath)) {
        var thumb = await sharp(entry[0].processedPngPath).resize(320, 200).png().toBuffer();
        res.writeHead(200, { 'Content-Type': 'image/png' }); res.end(thumb);
      } else { res.writeHead(404); res.end(); }
      return true;
    }

    if (p.startsWith('/api/admin/publish-history')) {
      var hist3 = readPublishHistory(DATA_DIR);
      respond(res, { history: hist3 });
      return true;
    }

    if (p === '/api/admin/override' && req.method === 'DELETE') {
      try { fs.unlinkSync(path.join(DATA_DIR, 'admin_override.json')); } catch(e) {}
      respond(res, { status: 'cleared' });
      return true;
    }

    if (p.startsWith('/api/admin/photos/') && req.method === 'DELETE') {
      respond(res, { status: 'ok' });
      return true;
    }

    if (p === '/api/admin/rollback') {
      respond(res, { status: 'ok', frameId: 'rollback:' + Date.now().toString(36) });
      return true;
    }

  } catch(e) {
    fail(res, 500, e.message);
    return true;
  }
  return false;
}

module.exports = { handleAdmin: handleAdmin };
