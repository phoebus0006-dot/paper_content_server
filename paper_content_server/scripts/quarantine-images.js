const fs = require('fs');
const path = require('path');

const indexFile = path.join(__dirname, '..', 'data', 'image_index.json');
const quarantineFile = path.join(__dirname, '..', 'audit', 'wrong-photo-quarantine.json');
const sourceConfig = path.join(__dirname, '..', 'config', 'photo_sources.json');

let index = [];
if (fs.existsSync(indexFile)) {
  index = JSON.parse(fs.readFileSync(indexFile, 'utf8'));
}

let allowedSourceIds = ['wikimedia_category', 'wikimedia_commons', 'local_import', 'local-import'];
try {
  const pCfg = JSON.parse(fs.readFileSync(sourceConfig, 'utf8'));
  if (pCfg.IMAGE_ALLOWED_SOURCE_IDS) allowedSourceIds = pCfg.IMAGE_ALLOWED_SOURCE_IDS.map(s => s.toLowerCase());
} catch(e) {}

const quarantineLog = [];

index.forEach(photo => {
  const sourceId = (photo.sourceId || photo.sourceType || photo.source || '').toLowerCase();
  const sourceName = (photo.sourceName || photo.source || '').toLowerCase();
  const titleLow = (photo.title || '').toLowerCase();
  
  let classification = 'VALID_TARGET_IMAGE';
  let reason = '';
  
  if (sourceName.includes('nasa') || titleLow.includes('nasa') || titleLow.includes('astronomy')) {
    classification = 'NASA_IMAGE';
    reason = 'Forbidden domain/topic NASA';
  } else if (sourceName.includes('unsplash') || sourceName.includes('picsum') || sourceName.includes('random')) {
    classification = 'RANDOM_SOURCE_IMAGE';
    reason = 'Forbidden random image generator';
  } else if (titleLow.includes('scenery') || titleLow.includes('landscape') || titleLow.includes('nature wallpaper')) {
    classification = 'SCENERY_IMAGE';
    reason = 'Forbidden scenery topic';
  } else if (!sourceName || sourceName === 'unknown') {
    classification = 'UNKNOWN_SOURCE_IMAGE';
    reason = 'Missing or unknown source name';
  } else if (!allowedSourceIds.includes(sourceId)) {
    classification = 'LEGACY_UNVERIFIED_IMAGE';
    reason = 'Source ID not in whitelist: ' + sourceId;
  }
  
  if (classification !== 'VALID_TARGET_IMAGE') {
    quarantineLog.push({
      photoId: photo.id || photo.photoId,
      title: photo.title,
      sourceId: photo.sourceId || photo.sourceType || photo.source,
      sourceName: photo.sourceName || photo.source,
      sourceUrl: photo.sourceUrl || photo.url,
      classification: classification,
      reason: reason,
      filePath: photo.rawPath || photo.imagePath,
      previousIndexStatus: photo.validationStatus || 'valid',
      recommendedAction: 'quarantine'
    });
    
    photo.quarantined = true;
    photo.validationStatus = 'legacy-unverified';
  } else {
    photo.quarantined = false;
  }
});

fs.writeFileSync(quarantineFile, JSON.stringify(quarantineLog, null, 2));
fs.writeFileSync(indexFile, JSON.stringify(index, null, 2));
console.log('Quarantine scan complete. Found ' + quarantineLog.length + ' bad photos.');
