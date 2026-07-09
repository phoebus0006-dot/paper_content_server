const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const DATA_DIR = path.join(__dirname, '..', 'data');
const RAW_IMAGES_DIR = path.join(DATA_DIR, 'raw_images');
const RAW_INDEX_FILE = path.join(DATA_DIR, 'raw_index.json');
const IMAGE_INDEX_FILE = path.join(DATA_DIR, 'image_index.json');

const MIN_FILE_SIZE_BYTES = 40000;
const MAX_WHITE_PIXEL_RATIO = 0.65;

async function checkQuality(rawPath, entry) {
  console.log(`\n--- ${entry.id} ---`);
  console.log(`Title: ${entry.title}`);
  console.log(`Raw: ${rawPath}`);

  const stats = fs.statSync(rawPath);
  console.log(`Size: ${stats.size} bytes`);
  if (stats.size < MIN_FILE_SIZE_BYTES) {
    console.log(`FAIL: too small (${stats.size} bytes)`);
    return false;
  }

  try {
    const { data, info } = await sharp(rawPath)
      .resize(400, 240, { fit: 'fill' })
      .flatten({ background: '#ffffff' })
      .raw()
      .toBuffer({ resolveWithObject: true });

    const total = info.width * info.height;
    let nearWhite = 0, nearBlack = 0, midTone = 0;
    let sumR = 0, sumG = 0, sumB = 0;
    const pixelCount = Math.min(total, 16000);
    const step = Math.max(1, Math.floor(total / pixelCount));

    for (let i = 0; i < total * 3; i += step * 3) {
      const r = data[i], g = data[i + 1], b = data[i + 2];
      sumR += r; sumG += g; sumB += b;
      if (r > 240 && g > 240 && b > 240) nearWhite++;
      else if (r < 30 && g < 30 && b < 30) nearBlack++;
      else if (r > 30 || g > 30 || b > 30) midTone++;
    }

    const sampled = Math.ceil(total / step);
    const whiteRatio = nearWhite / sampled;
    const blackRatio = nearBlack / sampled;
    const midRatio = midTone / sampled;
    const avgR = sumR / sampled, avgG = sumG / sampled, avgB = sumB / sampled;

    let variance = 0;
    for (let i = 0; i < total * 3; i += step * 3) {
      const r = data[i] - avgR, g = data[i + 1] - avgG, b = data[i + 2] - avgB;
      variance += (r * r + g * g + b * b) / 3;
    }
    variance /= sampled;
    const stdDev = Math.sqrt(variance);

    console.log(`White: ${(whiteRatio*100).toFixed(1)}% Black: ${(blackRatio*100).toFixed(1)}% Mid: ${(midRatio*100).toFixed(1)}%`);
    console.log(`StdDev: ${stdDev.toFixed(1)}`);

    let pass = true;
    if (whiteRatio > 0.60) { console.log(`FAIL: too white ${(whiteRatio*100).toFixed(0)}%`); pass = false; }
    if (blackRatio > 0.40 && midRatio < 0.15) { console.log(`FAIL: text-black ${(blackRatio*100).toFixed(0)}%`); pass = false; }
    if (whiteRatio + blackRatio > 0.50 && midRatio < 0.25) { console.log(`FAIL: binary ${((whiteRatio+blackRatio)*100).toFixed(0)}%`); pass = false; }
    if (stdDev < 28) { console.log(`FAIL: low contrast ${stdDev.toFixed(0)}`); pass = false; }
    if (pass) console.log('PASS: quality OK');
    return pass;
  } catch(e) {
    console.log(`ERROR: ${e.message}`);
    return false;
  }
}

async function main() {
  const rawIndex = JSON.parse(fs.readFileSync(RAW_INDEX_FILE, 'utf8'));
  const imageIndex = JSON.parse(fs.readFileSync(IMAGE_INDEX_FILE, 'utf8'));

  console.log('=== Raw Index Entries ===');
  for (const entry of rawIndex) {
    const rawPath = path.join(RAW_IMAGES_DIR, path.basename(entry.rawPath));
    if (!fs.existsSync(rawPath)) {
      console.log(`\n--- ${entry.id} --- raw file missing: ${rawPath}`);
      continue;
    }
    await checkQuality(rawPath, entry);
  }

  console.log('\n\n=== Image Index Summary ===');
  for (const entry of imageIndex) {
    const pngPath = path.join(DATA_DIR, 'processed_images', entry.imageName);
    const rawPath = path.join(RAW_IMAGES_DIR, path.basename(entry.rawPath));
    const pngExists = fs.existsSync(pngPath);
    const rawExists = fs.existsSync(rawPath);
    console.log(`${entry.id.slice(0,12)}... ${entry.sourceType} "${entry.title.slice(0,40)}" PNG:${pngExists} RAW:${rawExists} show:${entry.shownCount}`);
  }
}

main().catch(e => console.error(e));
