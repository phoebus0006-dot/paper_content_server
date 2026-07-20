const fs = require('fs');
const path = require('path');

async function main() {
  const serverPath = path.join(__dirname, 'server.js');
  let serverCode = fs.readFileSync(serverPath, 'utf8');

  // Task 2: Upload API
  const oldUpload = `    if (parsed.pathname === '/api/admin/photos/upload' && req.method === 'POST') {
      if (!adminAuth(req)) { failJson(res, 403, 'forbidden'); return; }
      try {
        var fname = req.headers['x-file-name'] ? decodeURIComponent(req.headers['x-file-name']) : 'upload.png';
        var ext = path.extname(fname).toLowerCase();
        if (!ext) ext = '.png';
        var rawBuf = await readBody(req, 20*1024*1024, true);
        if (!rawBuf || rawBuf.length === 0) { failJson(res, 400, 'empty file'); return; }
        var fid = 'upload-' + Date.now().toString(36);
        var rawDir = path.join(DATA_DIR, 'raw_images');
        if (!fs.existsSync(rawDir)) fs.mkdirSync(rawDir, { recursive: true });
        var fpath = path.join(rawDir, fid + ext);
        fs.writeFileSync(fpath, rawBuf);
        // 同步处理图片：之前只 spawn 'npm run process'，但 process-images.js 只读 raw_index.json，
        // 上传条目写在 image_index.json，导致上传图片永远不被处理（无 processedPngPath），
        // isImageReady 永远 false，手动发布会渲染 NO IMAGE 占位图。
        // 现在直接用 sharp 处理，生成 processedPngPath，让上传图片立即可用。
        var processedDir = path.join(DATA_DIR, 'processed_images');
        if (!fs.existsSync(processedDir)) fs.mkdirSync(processedDir, { recursive: true });
        var processedPngPath = path.join(processedDir, fid + '.png');
        var uploadSharp;
        try {
          uploadSharp = require('sharp');
          var upPipe = uploadSharp(fpath)
            .rotate()
            .resize(FRAME_WIDTH, FRAME_HEIGHT, { fit: 'cover', position: 'centre' })
            .modulate({ brightness: 1.05 })
            .sharpen({ sigma: 0.5, flat: 1, jagged: 2 })
            .flatten({ background: '#ffffff' });
          var upBuf = await upPipe.png().toBuffer();
          await fsp.writeFile(processedPngPath, upBuf);
        } catch(e) {
          console.error('Upload process failed:', e.message);
          // 即使处理失败也保留 raw 条目，用户可在图片库看到并重试
          // 注意：必须用 failJson 而非 respondJson，后者第二参数被当 data 永远返回 HTTP 200
          failJson(res, 500, 'upload saved but process failed: ' + e.message);
          return;
        }
        var imgIdx = [];
        try { imgIdx = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'image_index.json'), 'utf8')); } catch(e) {}
        if (!Array.isArray(imgIdx)) imgIdx = [];
        // 上传图片默认 poolType='study_frames' + theme='uploaded'，让 isStudySelectable 可选
        imgIdx.push({
          id: fid,
          rawPath: 'data/raw_images/' + path.basename(fpath),
          processedPngPath: 'data/processed_images/' + fid + '.png',
          status: 'processed',
          addedAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          title: fname,
          source: 'upload',
          theme: 'uploaded',
          kind: 'shot',
          poolType: 'study_frames',
          safetyStatus: 'approved',  // 上传图片用户主动上传，默认 approved
          width: FRAME_WIDTH,
          height: FRAME_HEIGHT,
          hash: sha1(rawBuf)
        });
        try { await R1_writeFileAtomic(path.join(DATA_DIR, 'image_index.json'), JSON.stringify(imgIdx, null, 2)); } catch(e) { failJson(res, 500, 'index save failed: ' + e.message); return; }
        // 刷新 runtime.imageIndex 内存，避免 buildPhotoSnapshot 用旧索引
        try { runtime.imageIndex = await loadImageIndex(); } catch(e) {}
        respondJson(res, { status: 'ok', photoId: fid });
      } catch (e) {
        console.error('Upload error:', e);
        failJson(res, 500, 'Upload failed: ' + e.message);
      }
      return;
    }`;

  const newUpload = `    if (parsed.pathname === '/api/admin/photos/upload' && req.method === 'POST') {
      if (!adminAuth(req)) { failJson(res, 403, 'forbidden'); return; }
      if (!runtime.customLibraryService) { failJson(res, 503, 'CLASSIFIER_UNAVAILABLE'); return; }
      try {
        var fname = req.headers['x-file-name'] ? decodeURIComponent(req.headers['x-file-name']) : 'upload.png';
        var expectedSize = req.headers['content-length'] ? parseInt(req.headers['content-length'], 10) : 0;
        var r = await runtime.customLibraryService.processUploadStream(req, { originalName: fname, expectedSize: expectedSize }, { maxBytes: 20 * 1024 * 1024 });
        if (r.status === 'REJECTED') { failJson(res, 503, r.reason); return; }
        if (r.status === 'ERROR') { failJson(res, 500, r.reason); return; }
        try { runtime.imageIndex = await loadImageIndex(); } catch(e) {}
        respondJson(res, { status: 'ok', photoId: r.assetId });
      } catch (e) {
        if (e.statusCode === 413) { failJson(res, 413, 'Payload Too Large'); }
        else { failJson(res, 500, 'Upload failed: ' + e.message); }
      }
      return;
    }`;

  // I will just use string replacement
  if (serverCode.includes('var rawBuf = await readBody(req, 20*1024*1024, true);')) {
    serverCode = serverCode.replace(oldUpload, newUpload);
  } else {
    console.log("oldUpload block not found! Might have been altered.");
  }

  // Task 6: resolveAllowedImagePath
  const resolvePathFunc = `
function resolveAllowedImagePath(requestedPath) {
  if (!requestedPath) return null;
  let absPath = path.isAbsolute(requestedPath) ? requestedPath : path.join(ROOT_DIR, requestedPath);
  try {
    let resolved = fs.realpathSync(absPath);
    let stat = fs.lstatSync(resolved);
    if (!stat.isFile()) return null;
    let allowedDirs = [
      path.join(ROOT_DIR, 'data'),
      path.join(ROOT_DIR, 'public'),
      path.join(ROOT_DIR, 'src')
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
  if (!serverCode.includes('function resolveAllowedImagePath')) {
    serverCode = serverCode.replace('function isImageReady(entry) {', resolvePathFunc + '\nfunction isImageReady(entry) {');
  }

  // Rewrite /api/admin/photos/:id/thumbnail to use it.
  const oldThumb = `    var thumbMatch = parsed.pathname.match(/^\\/api\\/admin\\/photos\\/([^/]+)\\/thumbnail$/);
    if (thumbMatch && req.method === 'GET') {
      if (!adminAuth(req)) { failJson(res, 403, 'forbidden'); return; }
      var tId = thumbMatch[1];
      var tIdx = [];
      try { tIdx = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'image_index.json'), 'utf8')); } catch(e) {}
      if (!Array.isArray(tIdx)) tIdx = [];
      var tFound = tIdx.find(function(e) { return e.id === tId; });
      if (!tFound) { res.writeHead(404); res.end(); return; }
      var tPath = tFound.processedPngPath;
      if (!tPath) tPath = tFound.rawPath;
      if (!tPath) { res.writeHead(404); res.end(); return; }
      var tpAbs = path.isAbsolute(tPath) ? tPath : path.join(ROOT_DIR, tPath);
      if (!fs.existsSync(tpAbs)) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'Content-Type': 'image/png' });
      fs.createReadStream(tpAbs).pipe(res);
      return;
    }`;
  
  const newThumb = `    var thumbMatch = parsed.pathname.match(/^\\/api\\/admin\\/photos\\/([^/]+)\\/thumbnail$/);
    if (thumbMatch) {
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.writeHead(405); res.end(); return;
      }
      if (!adminAuth(req)) { failJson(res, 403, 'forbidden'); return; }
      var tId = thumbMatch[1];
      var tIdx = [];
      try { tIdx = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'image_index.json'), 'utf8')); } catch(e) {}
      if (!Array.isArray(tIdx)) tIdx = [];
      var tFound = tIdx.find(function(e) { return e.id === tId; });
      if (!tFound) { res.writeHead(404); res.end(); return; }
      var tPath = tFound.processedPngPath;
      if (!tPath) tPath = tFound.rawPath;
      if (!tPath) { res.writeHead(404); res.end(); return; }
      var tpAbs = resolveAllowedImagePath(tPath);
      if (!tpAbs) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'private' });
      if (req.method === 'HEAD') { res.end(); return; }
      fs.createReadStream(tpAbs).pipe(res);
      return;
    }`;

  if (serverCode.includes(oldThumb)) {
    serverCode = serverCode.replace(oldThumb, newThumb);
  }

  // Delete logic in /api/admin/photos/:id
  const oldDelete = `          var pAbs = path.isAbsolute(found[field]) ? found[field] : path.join(ROOT_DIR, found[field]);
          try {
            if (fs.existsSync(pAbs)) fs.unlinkSync(pAbs);
          } catch(e) {}`;
  const newDelete = `          var pAbs = resolveAllowedImagePath(found[field]);
          try {
            if (pAbs) fs.unlinkSync(pAbs);
          } catch(e) {}`;
  serverCode = serverCode.replace(oldDelete, newDelete);
  serverCode = serverCode.replace(oldDelete, newDelete);

  fs.writeFileSync(serverPath, serverCode, 'utf8');
  console.log('server.js patched phase 2!');
}

main().catch(console.error);
