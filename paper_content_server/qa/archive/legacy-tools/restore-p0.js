const fs = require('fs');
const path = require('path');

const sPath = path.join(__dirname, 'server.js');
let s = fs.readFileSync(sPath, 'utf8');

// 1. readJsonBody
const jsonBodyCode = `
function readJsonBody(req, maxBytes) {
  return new Promise((resolve, reject) => {
    let body = [];
    let len = 0;
    req.on('data', chunk => {
      body.push(chunk);
      len += chunk.length;
      if (len > maxBytes) {
        req.destroy();
        reject({ code: 413, message: 'Payload Too Large' });
      }
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(body).toString()));
      } catch (e) {
        reject({ code: 400, message: 'Invalid JSON' });
      }
    });
    req.on('error', e => reject({ code: 500, message: e.message }));
  });
}
`;
if (!s.includes('function readJsonBody')) {
  s = s.replace(/const http = require\('http'\);/, jsonBodyCode + '\nconst http = require(\'http\');');
}

// 2. fix upload route
s = s.replace(
  /if \(req\.url === '\/api\/admin\/photos\/upload' && req\.method === 'POST'\) \{[\s\S]*?req\.pipe\(fs\.createWriteStream\(rawPath\)\)\.on\('finish', function\(\) \{[\s\S]*?\}\);[\s\S]*?\}/,
  `if (req.url === '/api/admin/photos/upload' && req.method === 'POST') {
      customLibraryService.processUploadStream(req, Date.now() + '.jpg').then(entry => {
        res.writeHead(200); res.end(JSON.stringify(entry));
      }).catch(err => {
        res.writeHead(500); res.end(JSON.stringify({error: err.message}));
      });
      return;
    }`
);

// 3. fix Focus Lock and One-Shot in override persistence (server.js missing assetId check removal)
s = s.replace(
  /if \(persistedOverride &&[\s\S]*?persistedOverride\.assetId &&[\s\S]*?persistedOverride\.snapshotId\) \{/,
  `if (persistedOverride && (persistedOverride.mode === 'ONE_SHOT_OVERRIDE' || persistedOverride.mode === 'FOCUS_LOCK') && persistedOverride.snapshotId) {`
);

// 4. Update override-persistence.js
const ovPath = path.join(__dirname, 'src/admin/override-persistence.js');
if (fs.existsSync(ovPath)) {
  let ov = fs.readFileSync(ovPath, 'utf8');
  ov = ov.replace(
    /if \(\!state\.assetId\) \{/,
    `if (!state.assetId) {
      if (state.contentType === 'news' || state.contentType === 'photo') {
         if (state.expiresAt && new Date(state.expiresAt) <= new Date()) {
           return { valid: false, reason: 'EXPIRED' };
         }
         return { valid: true };
      }`
  );
  fs.writeFileSync(ovPath, ov);
}

// 5. Fix frameId in getContentForNow
s = s.replace(
  /var frameId = mode \+ ':' \+ formatTimeForFrameId\(t\);/,
  `var frameId = effectiveMode + ':' + formatTimeForFrameId(t);`
);

// 6. fix path traversal in /api/admin/photos/thumbnail
s = s.replace(
  /var relativePath = decodeURIComponent\(req\.url\.split\('\?path='\)[1]\);[\s\S]*?var absPath = path\.join\(ROOT_DIR, relativePath\);/,
  `var relativePath = decodeURIComponent(req.url.split('?path=')[1]);
      var absPath = resolveAllowedImagePath(relativePath);
      if (!absPath) { res.writeHead(403); return res.end(); }`
);

// 7. fix path traversal in delete
s = s.replace(
  /fs\.unlinkSync\(path\.join\(ROOT_DIR, entry\.rawPath\)\);/g,
  `var p1 = resolveAllowedImagePath(entry.rawPath); if (p1) fs.unlinkSync(p1);`
);
s = s.replace(
  /fs\.unlinkSync\(path\.join\(ROOT_DIR, entry\.processedPngPath\)\);/g,
  `var p2 = resolveAllowedImagePath(entry.processedPngPath); if (p2) fs.unlinkSync(p2);`
);
s = s.replace(
  /fs\.unlinkSync\(path\.join\(ROOT_DIR, entry\.epfPath\)\);/g,
  `var p3 = resolveAllowedImagePath(entry.epfPath); if (p3) fs.unlinkSync(p3);`
);

fs.writeFileSync(sPath, s);
console.log('Restored all P0 patches');
