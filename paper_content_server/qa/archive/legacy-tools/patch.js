const fs = require('fs');
const path = require('path');

async function main() {
  console.log('Starting patching...');
  const serverPath = path.join(__dirname, 'server.js');
  let serverCode = fs.readFileSync(serverPath, 'utf8');

  // Task 1: isImageApproved - wait, already done but let's make sure
  serverCode = serverCode.replace(
    /function isImageApproved\(entry\) \{\s*\/\/.*?\s*\/\/.*?\s*\/\/.*?\s*\/\/.*?\s*return entry && \(entry\.safetyStatus === 'approved'.*?\);\s*\}/s,
    `function isImageApproved(entry) {\n  return entry && entry.safetyStatus === 'approved';\n}`
  );

  // Task 2 & 8: readJsonBody & readBody
  const readJsonBodyStr = `
function readJsonBody(req, opts) {
  opts = opts || {};
  const maxBytes = opts.maxBytes || 256 * 1024;
  return new Promise((resolve, reject) => {
    let chunks = [];
    let total = 0;
    let done = false;
    req.on('data', c => {
      if (done) return;
      total += c.length;
      if (total > maxBytes) {
        done = true;
        // Don't req.destroy() here to avoid socket reset, just resume stream
        req.resume();
        const err = new Error('Payload Too Large');
        err.statusCode = 413;
        reject(err);
      } else {
        chunks.push(c);
      }
    });
    req.on('end', () => {
      if (done) return;
      done = true;
      try {
        const str = Buffer.concat(chunks).toString('utf8');
        if (!str) resolve({});
        else resolve(JSON.parse(str));
      } catch (e) {
        const err = new Error('Invalid JSON');
        err.statusCode = 400;
        reject(err);
      }
    });
    req.on('error', err => {
      if (done) return;
      done = true;
      reject(err);
    });
  });
}
`;
  if (!serverCode.includes('function readJsonBody')) {
    serverCode = serverCode.replace('function respondJson(res, data)', readJsonBodyStr + '\nfunction respondJson(res, data)');
  }
  serverCode = serverCode.replace(/var (\w+) = JSON\.parse\(await readBody\(req\)\);/g, 'var $1 = await readJsonBody(req);');
  serverCode = serverCode.replace(/var (\w+) = JSON\.parse\(await readBody\(req\) \|\| '\{\}'\);/g, 'var $1 = await readJsonBody(req);');
  serverCode = serverCode.replace(/try \{ pbBody = JSON\.parse\(await readBody\(req\)\); \} catch\(e\) \{ failJson\(res, 400, 'invalid JSON body'\); return; \}/g, 'try { pbBody = await readJsonBody(req); } catch(e) { failJson(res, e.statusCode || 400, e.message); return; }');
  serverCode = serverCode.replace(/try \{ var drb = JSON\.parse\(await readBody\(req\) \|\| '\{\}'\); if \(drb && drb\.reason\) delReasonRaw = drb\.reason; \} catch\(e\) \{\}/g, 'try { var drb = await readJsonBody(req); if (drb && drb.reason) delReasonRaw = drb.reason; } catch(e) {}');

  // Replace draft error catching
  serverCode = serverCode.replace(
    /try \{\s*pbBody = await readJsonBody\(req\);\s*\} catch\(e\) \{ failJson\(res, e\.statusCode \|\| 400, e\.message\); return; \}/,
    `try { pbBody = await readJsonBody(req); } catch(e) { failJson(res, e.statusCode || 400, e.message); return; }`
  );
  
  // Task 4: computeNextHalfHourBoundary and computeNextSwitchAt
  if (!serverCode.includes('function computeNextHalfHourBoundary')) {
    const timeFunc = `
function computeNextHalfHourBoundary(now, tz) {
  const t = getWallTime(now, tz || TIMEZONE);
  let year = t.year, month = t.month, day = t.day, hour = t.hour, minute = 0;
  if (t.minute < 30) {
    minute = 30;
  } else {
    hour = t.hour + 1;
    minute = 0;
  }
  return dateFromWallTime({ year, month, day, hour, minute, second: 0 }, tz || TIMEZONE);
}
`;
    serverCode = serverCode.replace('function computeNextSwitchAt(now) {', timeFunc + '\nfunction computeNextSwitchAt(now) {');
  }

  serverCode = serverCode.replace(
    /if \(t\.hour < 10\) \{\s*hour = 10;\s*minute = 30;\s*\}/,
    `if (t.hour < 10) { hour = 10; minute = 0; }`
  );
  serverCode = serverCode.replace(
    /const next = new Date\(Date\.UTC\(year, month - 1, day \+ 1, 12\)\);\s*const nextWall = getWallTime\(next, TIMEZONE\);\s*year = nextWall\.year;\s*month = nextWall\.month;\s*day = nextWall\.day;\s*hour = 10;\s*minute = 30;/,
    `const next = new Date(Date.UTC(year, month - 1, day + 1, 12));
    const nextWall = getWallTime(next, TIMEZONE);
    year = nextWall.year; month = nextWall.month; day = nextWall.day;
    hour = 10; minute = 0;`
  );

  // Task 5: getContentForNow frameId
  serverCode = serverCode.replace(
    /const frameId = \`\$\{snapshot\.mode\}:\$\{snapshot\.slotKey\}:\$\{news\.frameId\}\`;/,
    'const frameId = `${effectiveMode}:${snapshot.slotKey}:${news.frameId}`;'
  );

  // Task 3: one-shot build snapshot
  const oldOneShotLogic = `        if (contentType === 'news') {
          osContent = await buildNewsSnapshot(osNow);
        } else if (assetId) {
          // Explicit asset selection via assetSelectionService
          if (!runtime.assetSelectionService) {
            failJson(res, 400, 'assetSelectionService unavailable — cannot select explicit asset'); return;
          }
          try {
            var osSelection = await runtime.assetSelectionService.selectForOneShot(libraryType, assetId);
            osContent = await buildPhotoSnapshotFromAsset(osSelection.asset, osNow, 'one-shot:photo');
          } catch(selErr) {
            failJson(res, 400, 'asset selection failed: ' + selErr.message); return;
          }
        } else {
          osContent = await buildPhotoSnapshot(osNow);
        }`;
  const newOneShotLogic = `        if (contentType === 'news') {
          osContent = await getContentForNow(osNow, { forceMode: 'news' });
        } else if (assetId) {
          if (!runtime.assetSelectionService) {
            failJson(res, 400, 'assetSelectionService unavailable — cannot select explicit asset'); return;
          }
          try {
            var osSelection = await runtime.assetSelectionService.selectForOneShot(libraryType, assetId);
            var buildPhotoContent = await buildPhotoSnapshotFromAsset(osSelection.asset, osNow, 'one-shot:photo');
            osContent = { snapshot: buildPhotoContent.snapshot, frame: buildPhotoContent.frame };
          } catch(selErr) {
            failJson(res, 400, 'asset selection failed: ' + selErr.message); return;
          }
        } else {
          osContent = await getContentForNow(osNow, { forceMode: 'photo' });
        }`;
  serverCode = serverCode.replace(oldOneShotLogic, newOneShotLogic);

  // Task 4: one-shot expires
  serverCode = serverCode.replace(
    /var osExpiresAt = computeNextSwitchAt\(osNow\);/g,
    'var osExpiresAt = computeNextHalfHourBoundary(osNow, TIMEZONE);'
  );

  // Write changes back to server.js
  fs.writeFileSync(serverPath, serverCode, 'utf8');
  console.log('server.js patched phase 1!');
}

main().catch(console.error);
