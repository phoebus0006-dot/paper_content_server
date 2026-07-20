const fs = require('fs');
const path = require('path');

const serverFile = path.join(__dirname, '../server.js');
let code = fs.readFileSync(serverFile, 'utf8');

// 1. Add requires for new services at the top of server.js
const requires = `
const { AdminStateService } = require('./src/admin/admin-state-service');
const { NewsTitleService } = require('./src/news/news-title-service');
const { ImageRecipeService } = require('./src/images/image-recipe-service');
const { ImageRasterizer } = require('./src/images/image-rasterizer-v2');
const { SafeImagePath } = require('./src/files/safe-image-path');
const { PublicationHistoryAdapter } = require('./src/publication/publication-history-adapter');
const { handleAdminRoutes } = require('./src/admin/admin-routes');
`;
if (!code.includes('AdminStateService')) {
  code = code.replace(/(const fs = require\('fs'\);)/, `$1\n${requires}`);
}

// 2. Inject service instantiations right after runtime is initialized
// We find where runtime is populated
const runtimeInitMatch = code.match(/runtime\.mqttClient = boot\.deps\.mqttClient \|\| null;/);
if (runtimeInitMatch) {
  const initCode = `
  runtime.safeImagePath = new SafeImagePath({ rootDir: ROOT_DIR });
  runtime.imageRasterizer = new ImageRasterizer();
  runtime.imageRecipeService = new ImageRecipeService({ assetRepository: runtime.assetRepository, imageRasterizer: runtime.imageRasterizer });
  // Pass dummy text rasterizer or real one if we had it
  runtime.newsTitleService = new NewsTitleService({ textRasterizer: null }); 
  runtime.publicationHistoryAdapter = new PublicationHistoryAdapter({ rawHistoryFile: path.join(DATA_DIR, 'publish_history.json') });
  runtime.adminStateService = new AdminStateService({
    operatingModeService: runtime.operatingModeService,
    snapshotStore: runtime.snapshotStore,
    publicationHistory: runtime.publicationHistoryAdapter,
    mqttClient: runtime.mqttClient
  });
`;
  if (!code.includes('runtime.adminStateService = new AdminStateService')) {
    code = code.replace(/(runtime\.mqttClient = boot\.deps\.mqttClient \|\| null;)/, `$1\n${initCode}`);
  }
}

// 3. Replace the Admin Routes block
const adminRoutesRegex = /\/\/ ── Admin routes ──[\s\S]*?(?=\/\/ ── End Admin routes ──|\/\/ ── MQTT ──|function failJson)/;
if (adminRoutesRegex.test(code)) {
  const newAdminRoutes = `// ── Admin routes ──
    if (parsed.pathname === '/admin' || parsed.pathname === '/admin/' ||
        parsed.pathname.startsWith('/admin/') || parsed.pathname.startsWith('/api/admin/')) {
      if (!adminNetworkCheck(req)) { failJson(res, 403, 'ADMIN_NETWORK_DENIED'); return; }
      if (req.method !== 'GET' && req.method !== 'OPTIONS') {
        var csrfResult = adminCSRFCheck(req);
        if (!csrfResult.allowed) {
          var csrfErr = csrfResult.error;
          if (csrfErr !== 'INVALID_ORIGIN' && csrfErr !== 'INVALID_REFERER') csrfErr = 'ADMIN_CROSS_ORIGIN_DENIED';
          failJson(res, 403, csrfErr);
          return;
        }
      }
      if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
    }
    
    if (parsed.pathname === '/api/admin/access-mode') {
      respondJson(res, { mode: ADMIN_ACCESS_MODE });
      return;
    }
    if (parsed.pathname === '/admin' || parsed.pathname === '/admin/') {
      var h = serveAdminFile('index.html');
      if (h) { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(h); return; }
      res.writeHead(500); res.end('Admin file missing'); return;
    }
    if (parsed.pathname === '/admin/admin.css') {
      var c = serveAdminFile('admin.css');
      if (c) { res.writeHead(200, { 'Content-Type': 'text/css; charset=utf-8' }); res.end(c); return; }
    }
    if (parsed.pathname === '/admin/admin.js') {
      var j = serveAdminFile('admin.js');
      if (j) { res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' }); res.end(j); return; }
    }

    if (parsed.pathname.startsWith('/api/admin/')) {
      var handled = await handleAdminRoutes(req, res, parsed, runtime, {
        adminStateService: runtime.adminStateService,
        newsTitleService: runtime.newsTitleService,
        imageRecipeService: runtime.imageRecipeService,
        publicationHistoryAdapter: runtime.publicationHistoryAdapter,
        safeImagePath: runtime.safeImagePath,
        adminAuth: adminAuth,
        ROOT_DIR: ROOT_DIR,
        DATA_DIR: DATA_DIR
      });
      if (handled) return;
    }
    
    // `;
    
    code = code.replace(adminRoutesRegex, newAdminRoutes);
}

fs.writeFileSync(serverFile, code);
console.log('Successfully refactored server.js');
