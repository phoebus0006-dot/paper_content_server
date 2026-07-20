const fs = require('fs');
const sPath = 'server.js';
let s = fs.readFileSync(sPath, 'utf8');

// 1. isImageApproved
s = s.replace(
  /function isImageApproved\(entry\) \{[\s\S]*?return true;\n\}/,
  `function isImageApproved(entry) { return entry && entry.safetyStatus === 'approved'; }`
);

// 2. resolveAllowedImagePath
const resolveCode = `
function resolveAllowedImagePath(requestedPath) {
  if (!requestedPath) return null;
  const path = require('path');
  let absPath = path.isAbsolute(requestedPath) ? requestedPath : path.join(__dirname, requestedPath);
  try {
    let resolved = fs.realpathSync(absPath);
    let stat = fs.lstatSync(resolved);
    if (!stat.isFile()) return null;
    let allowedDirs = [
      path.join(__dirname, 'data'),
      path.join(__dirname, 'public'),
      path.join(__dirname, 'src')
    ];
    let isAllowed = false;
    for (let d of allowedDirs) {
      if (resolved.startsWith(fs.realpathSync(d))) {
        isAllowed = true;
        break;
      }
    }
    return isAllowed ? resolved : null;
  } catch(e) {
    return null;
  }
}
`;
if (!s.includes('function resolveAllowedImagePath')) {
  s = s.replace(/function loadAppConfig\(\) \{/, resolveCode + '\nfunction loadAppConfig() {');
}

// 3. computeNextHalfHourBoundary
const boundaryCode = `
function computeNextHalfHourBoundary(now, tz) {
  const t = getWallTime(now, tz || TIMEZONE);
  let year = t.year, month = t.month, day = t.day, hour = t.hour, minute = 0;
  if (t.minute < 30) { minute = 30; } else { hour = t.hour + 1; minute = 0; }
  return dateFromWallTime({ year, month, day, hour, minute, second: 0 }, tz || TIMEZONE);
}
`;
if (!s.includes('function computeNextHalfHourBoundary')) {
  s = s.replace(/function computeNextSwitchAt/, boundaryCode + '\nfunction computeNextSwitchAt');
}

// 4. readJsonBody
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

// 5. Replace readBody usages
s = s.replace(/req\.on\('data', function\(c\) \{ body\.push\(c\); \}\);\s*req\.on\('end', function\(\) \{/g, 
  'readJsonBody(req, 256*1024).then(function(parsed) { var body = [Buffer.from(JSON.stringify(parsed))];');

// 6. fix upload route
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

// 7. fix Focus Lock and One-Shot in override persistence
s = s.replace(
  /if \(persistedOverride &&[\s\S]*?persistedOverride\.assetId &&[\s\S]*?persistedOverride\.snapshotId\) \{/,
  `if (persistedOverride && (persistedOverride.mode === 'ONE_SHOT_OVERRIDE' || persistedOverride.mode === 'FOCUS_LOCK') && persistedOverride.snapshotId) {`
);

const ovPath = 'src/admin/override-persistence.js';
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

// 8. Fix frameId in getContentForNow
s = s.replace(
  /var frameId = mode \+ ':' \+ formatTimeForFrameId\(t\);/,
  `var frameId = effectiveMode + ':' + Date.now();` // just replaced since formatTimeForFrameId doesn't exist
);

// 9. fix path traversal in /api/admin/photos/thumbnail
s = s.replace(
  /var relativePath = decodeURIComponent\(req\.url\.split\('\?path='\)[1]\);[\s\S]*?var absPath = path\.join\(ROOT_DIR, relativePath\);/,
  `var relativePath = decodeURIComponent(req.url.split('?path=')[1]);
      var absPath = resolveAllowedImagePath(relativePath);
      if (!absPath) { res.writeHead(403); return res.end(); }`
);

// 10. fix path traversal in delete
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
console.log('Setup P0 fixes complete.');
