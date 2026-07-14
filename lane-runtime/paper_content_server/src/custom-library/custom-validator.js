// custom-validator.js — Upload validation rules
var ALLOWED_MIME = ['image/jpeg','image/png','image/webp'];
var ALLOWED_EXT = ['.jpg','.jpeg','.png','.webp'];
var MAX_FILE_SIZE = 50 * 1024 * 1024;
var MAX_DIMENSION = 8192;
function validate(upload) {
  var errors = [];
  if (!upload) return { ok: false, errors: ['No upload data'] };
  if (upload.fileSize > MAX_FILE_SIZE) errors.push('File too large: ' + upload.fileSize);
  if (upload.mimeType && ALLOWED_MIME.indexOf(upload.mimeType) < 0) errors.push('Invalid MIME: ' + upload.mimeType);
  var ext = upload.originalName ? '.' + upload.originalName.split('.').pop().toLowerCase() : '';
  if (ext && ALLOWED_EXT.indexOf(ext) < 0) errors.push('Invalid extension: ' + ext);
  if (upload.width > MAX_DIMENSION) errors.push('Width too large: ' + upload.width);
  if (upload.height > MAX_DIMENSION) errors.push('Height too large: ' + upload.height);
  return { ok: errors.length === 0, errors: errors };
}
module.exports = { createValidator: function() { return { validate: validate }; }, ALLOWED_MIME: ALLOWED_MIME, ALLOWED_EXT: ALLOWED_EXT, MAX_FILE_SIZE: MAX_FILE_SIZE, MAX_DIMENSION: MAX_DIMENSION };