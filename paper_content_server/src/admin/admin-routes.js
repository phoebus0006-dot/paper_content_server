const fs = require('fs');
const path = require('path');

function handleAdminRoutes(req, res, parsed, runtime, options = {}) {
  const {
    adminStateService,
    newsTitleService,
    imageRecipeService,
    publicationHistoryAdapter,
    safeImagePath,
    adminAuth,
    ROOT_DIR,
    DATA_DIR
  } = options;

  function respondJson(res, data, headers = {}) {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', ...headers });
    res.end(JSON.stringify(data));
  }

  function failJson(res, code, msg, headers = {}) {
    res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', ...headers });
    res.end(JSON.stringify({ error: msg }));
  }

  return new Promise(async (resolve, reject) => {
    async function readBody(req) {
      return new Promise((res, rej) => {
        let body = '';
        req.on('data', chunk => body += chunk.toString());
        req.on('end', () => res(body));
        req.on('error', rej);
      });
    }

    try {
      if (parsed.pathname === '/api/admin/state' && req.method === 'GET') {
        if (!adminAuth(req)) { failJson(res, 403, 'forbidden'); return resolve(true); }
        const state = await adminStateService.getAdminState();
        respondJson(res, state);
        return resolve(true);
      }

      if (parsed.pathname === '/api/admin/dashboard' && req.method === 'GET') {
        if (!adminAuth(req)) { failJson(res, 403, 'forbidden'); return resolve(true); }
        const state = await adminStateService.getAdminState();
        respondJson(res, {
          status: 'ok',
          currentMode: state.active.contentMode,
          frameId: state.active.frameId,
          nextSwitchLocal: state.schedule.nextSwitchAt,
          manualOverride: state.override.type,
          overrideExpiresAt: state.override.expiresAt,
          lastPublishedAt: state.lastPublication ? state.lastPublication.publishedAt : null
        }, { 'Deprecation': 'true' });
        return resolve(true);
      }

      if (parsed.pathname === '/api/admin/system/status' && req.method === 'GET') {
        if (!adminAuth(req)) { failJson(res, 403, 'forbidden'); return resolve(true); }
        const state = await adminStateService.getAdminState();
        respondJson(res, state, { 'Deprecation': 'true' });
        return resolve(true);
      }

      if (parsed.pathname === '/api/admin/news/draft' && req.method === 'POST') {
        if (!adminAuth(req)) { failJson(res, 403, 'forbidden'); return resolve(true); }
        const db = JSON.parse(await readBody(req));
        const items = db.items || db.selected || [];
        if (items.length !== 6) { failJson(res, 400, 'need exactly 6 items'); return resolve(true); }
        
        const processed = [];
        for (const item of items) {
          const result = await newsTitleService.normalizeTitle(item.rawTitle || item.title);
          processed.push({ ...item, ...result });
        }
        
        fs.writeFileSync(path.join(DATA_DIR, 'admin_news_draft.json'), JSON.stringify({ items: processed }, null, 2));
        respondJson(res, { status: 'ok', items: processed });
        return resolve(true);
      }

      if (parsed.pathname === '/api/admin/photo-eink-preview' && req.method === 'POST') {
        if (!adminAuth(req)) { failJson(res, 403, 'forbidden'); return resolve(true); }
        const body = JSON.parse(await readBody(req));
        const { assetId, recipe } = body;
        const result = await imageRecipeService.processAsset(assetId, recipe, { skipSafetyCheck: true, skipReviewCheck: true });
        
        res.writeHead(200, {
          'Content-Type': result.mimeType,
          'X-Source-Hash': result.sourceHash,
          'X-Recipe-Hash': result.recipeHash,
          'X-Processed-Image-Hash': result.processedImageHash
        });
        res.end(result.buffer);
        return resolve(true);
      }

      const photoMatch = parsed.pathname.match(/^\/api\/admin\/photos\/([^/]+)\/thumbnail$/);
      if (photoMatch && req.method === 'GET') {
        if (!adminAuth(req)) { failJson(res, 403, 'forbidden'); return resolve(true); }
        const assetId = photoMatch[1];
        let photoIdx = [];
        try { photoIdx = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'image_index.json'), 'utf8')); } catch(e) {}
        const entry = photoIdx.find(p => p.id === assetId);
        if (!entry) { failJson(res, 404, 'not found'); return resolve(true); }
        
        try {
          const rawPath = entry.thumbnailPath || entry.rawPath;
          if (!rawPath) { failJson(res, 404, 'no image path'); return resolve(true); }
          const safeP = safeImagePath.resolve(rawPath);
          const ext = path.extname(safeP).toLowerCase();
          const ct = ext === '.png' ? 'image/png' : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : ext === '.webp' ? 'image/webp' : 'application/octet-stream';
          const buf = fs.readFileSync(safeP);
          res.writeHead(200, { 'Content-Type': ct, 'Cache-Control': 'private, no-store' });
          res.end(buf);
        } catch (e) {
          failJson(res, 400, 'safe path error: ' + e.message);
        }
        return resolve(true);
      }

      if (parsed.pathname === '/api/admin/publish-history' && req.method === 'GET') {
        if (!adminAuth(req)) { failJson(res, 403, 'forbidden'); return resolve(true); }
        const history = await publicationHistoryAdapter.readHistory();
        if (history.length > 0) {
          history[0].status = 'active';
          for (let i = 1; i < history.length; i++) history[i].status = 'archived';
        }
        respondJson(res, { history });
        return resolve(true);
      }

      resolve(false); // Not handled
    } catch (e) {
      failJson(res, 500, e.message);
      resolve(true); // Handled with error
    }
  });
}

module.exports = { handleAdminRoutes };
