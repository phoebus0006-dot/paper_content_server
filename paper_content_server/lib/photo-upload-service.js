const busboy = require('busboy');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const sharp = require('sharp');

// Ensure image directory uses proper ENV or fallback
const IMAGE_DIR = process.env.IMAGE_DIR || path.join(__dirname, '..', 'data', 'images');
const TEMP_DIR = path.join(IMAGE_DIR, 'tmp');
const IMPORT_DIR = path.join(IMAGE_DIR, 'local-import');

if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });
if (!fs.existsSync(IMPORT_DIR)) fs.mkdirSync(IMPORT_DIR, { recursive: true });

const MAX_FILE_SIZE = parseInt(process.env.MAX_UPLOAD_SIZE, 10) || 5 * 1024 * 1024;
const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp'];
const ALLOWED_EXT = ['.jpg', '.jpeg', '.png', '.webp'];

function getMagicBytes(filePath) {
  const fd = fs.openSync(filePath, 'r');
  const buffer = Buffer.alloc(12);
  fs.readSync(fd, buffer, 0, 12, 0);
  fs.closeSync(fd);
  const hex = buffer.toString('hex').toUpperCase();
  if (hex.startsWith('FFD8FF')) return 'jpeg';
  if (hex.startsWith('89504E470D0A1A0A')) return 'png';
  if (hex.startsWith('52494646') && hex.substring(16, 24) === '57454250') return 'webp';
  return 'unknown';
}

function atomicUpdateImageIndex(newPhoto) {
  const indexPath = path.join(IMAGE_DIR, '..', 'image_index.json');
  // if IMAGE_DIR is /app/images, index might be at /app/data/image_index.json. 
  // Let's resolve safely based on ROOT
  const actualIndexPath = path.resolve(IMAGE_DIR, '../data/image_index.json');
  
  let lockFile = actualIndexPath + '.lock';
  let retries = 5;
  while (fs.existsSync(lockFile) && retries > 0) {
    const lockAge = Date.now() - fs.statSync(lockFile).mtimeMs;
    if (lockAge > 10000) fs.unlinkSync(lockFile); // Stale lock
    else {
      require('child_process').execSync('sleep 0.5');
      retries--;
    }
  }
  
  fs.writeFileSync(lockFile, String(Date.now()));
  try {
    let index = [];
    if (fs.existsSync(actualIndexPath)) {
      try { index = JSON.parse(fs.readFileSync(actualIndexPath, 'utf8')); } catch(e){}
    }
    index.unshift(newPhoto); // Prepend to show up first
    fs.writeFileSync(actualIndexPath + '.tmp', JSON.stringify(index, null, 2));
    fs.renameSync(actualIndexPath + '.tmp', actualIndexPath);
  } finally {
    if (fs.existsSync(lockFile)) fs.unlinkSync(lockFile);
  }
}

async function handlePhotoUpload(req, res) {
  if (!req.headers['content-type'] || !req.headers['content-type'].includes('multipart/form-data')) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'must be multipart/form-data' }));
    return;
  }

  const bb = busboy({ headers: req.headers, limits: { files: 1, fileSize: MAX_FILE_SIZE } });
  let uploadError = null;
  let fileSaved = false;
  let tempFilePath = '';
  let finalFileName = '';

  bb.on('file', (name, file, info) => {
    const { filename, encoding, mimeType } = info;
    const ext = path.extname(filename).toLowerCase();

    if (!ALLOWED_MIME.includes(mimeType) || !ALLOWED_EXT.includes(ext)) {
      uploadError = 'Invalid file type. Only JPEG, PNG, and WebP are allowed.';
      file.resume();
      return;
    }

    finalFileName = crypto.randomBytes(16).toString('hex') + ext;
    tempFilePath = path.join(TEMP_DIR, finalFileName);

    const writeStream = fs.createWriteStream(tempFilePath);
    file.pipe(writeStream);

    file.on('limit', () => {
      uploadError = 'File exceeds the 5MB limit.';
      writeStream.destroy();
      if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
    });

    writeStream.on('close', () => {
      if (!uploadError) fileSaved = true;
    });
  });

  bb.on('finish', async () => {
    if (uploadError) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: uploadError }));
      return;
    }

    if (!fileSaved || !fs.existsSync(tempFilePath)) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'No file uploaded or file processing failed.' }));
      return;
    }

    try {
      // 1. Verify Magic Bytes
      const magic = getMagicBytes(tempFilePath);
      if (magic === 'unknown') throw new Error('Invalid file signature or magic bytes.');

      // 2. Decode with Sharp
      const metadata = await sharp(tempFilePath).metadata();
      if (!metadata || !metadata.width || !metadata.height) throw new Error('Unreadable image metadata.');

      // 3. Atomically move to import directory
      const finalFilePath = path.join(IMPORT_DIR, finalFileName);
      fs.renameSync(tempFilePath, finalFilePath);

      // 4. Generate SHA256
      const fileBuffer = fs.readFileSync(finalFilePath);
      const sha256 = crypto.createHash('sha256').update(fileBuffer).digest('hex');

      // 5. Create index record
      const photoId = 'img_' + crypto.randomBytes(8).toString('hex');
      const newPhoto = {
        id: photoId,
        photoId: photoId,
        title: 'Uploaded Photo',
        sourceId: 'local-import',
        sourceName: 'Local Import',
        sourceUrl: null,
        sourceTopic: 'local-import',
        targetCategory: '综合',
        targetKeyword: '上传',
        fetchedAt: new Date().toISOString(),
        contentType: metadata.format === 'jpeg' ? 'image/jpeg' : `image/${metadata.format}`,
        width: metadata.width,
        height: metadata.height,
        sha256: sha256,
        validationStatus: 'valid',
        validationReason: 'local manual upload',
        fileName: finalFileName,
        rawPath: path.join('local-import', finalFileName), // relative to IMAGE_DIR
        quarantined: false
      };

      atomicUpdateImageIndex(newPhoto);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', photoId: photoId, file: finalFileName }));

    } catch (err) {
      if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Image validation failed: ' + err.message }));
    }
  });

  req.pipe(bb);
}

module.exports = {
  handlePhotoUpload
};
