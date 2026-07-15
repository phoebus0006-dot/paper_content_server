const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

// Ensure image directory uses proper ENV or fallback
const IMAGE_DIR = process.env.IMAGE_DIR || path.join(__dirname, '..', 'data', 'images');
const RAW_INDEX_FILE = path.join(IMAGE_DIR, '..', 'image_index.json');

async function handlePhotoPreview(req, res, parsed) {
  try {
    const id = parsed.searchParams.get('id');
    if (!id) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'missing id' }));
      return;
    }

    let index = [];
    if (fs.existsSync(RAW_INDEX_FILE)) {
      try { index = JSON.parse(fs.readFileSync(RAW_INDEX_FILE, 'utf8')); } catch(e){}
    }
    const photo = index.find(p => p.photoId === id || p.id === id);
    if (!photo || !photo.rawPath) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'not-found' }));
      return;
    }

    // Safely resolve the path strictly within IMAGE_DIR
    const targetPath = path.resolve(IMAGE_DIR, photo.rawPath);
    if (!targetPath.startsWith(path.resolve(IMAGE_DIR))) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'path-traversal-detected' }));
      return;
    }

    if (!fs.existsSync(targetPath)) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'file-not-found' }));
      return;
    }

    // Safety checks on parameters
    let b = parseFloat(parsed.searchParams.get('b')) || 1.0;
    let s = parseFloat(parsed.searchParams.get('s')) || 1.0;
    let g = parseFloat(parsed.searchParams.get('g')) || 1.0;
    let rotate = parseInt(parsed.searchParams.get('r')) || 0;
    
    // Bounds checking
    if (b < 0.1) b = 0.1; if (b > 5.0) b = 5.0;
    if (s < 0.0) s = 0.0; if (s > 5.0) s = 5.0;
    if (g < 0.1) g = 0.1; if (g > 5.0) g = 5.0;
    const allowedRotations = [0, 90, 180, 270, -90, -180, -270];
    if (!allowedRotations.includes(rotate)) rotate = 0;

    const flipH = parseInt(parsed.searchParams.get('fh')) === 1;
    const flipV = parseInt(parsed.searchParams.get('fv')) === 1;

    let pipeline = sharp(targetPath)
      .resize(800, 480, { fit: 'inside', withoutEnlargement: true }) // Limit output dimensions
      .rotate(rotate)
      .modulate({ brightness: b, saturation: s });

    if (flipH) pipeline = pipeline.flop();
    if (flipV) pipeline = pipeline.flip();
    if (g !== 1.0) pipeline = pipeline.gamma(g);

    if (parsed.pathname === '/api/admin/photo-eink-preview') {
      pipeline = pipeline.grayscale();
    }

    const buf = await pipeline.timeout({ seconds: 5 }).png().toBuffer();
    
    res.writeHead(200, { 'Content-Type': 'image/png', 'Content-Length': buf.length });
    res.end(buf);

  } catch (e) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: e.message }));
  }
}

module.exports = {
  handlePhotoPreview
};
