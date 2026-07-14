// custom-upload-model.js — Upload candidate model
function createUpload(fields) {
  if (!fields || !fields.filePath) throw new Error('upload requires filePath');
  return Object.freeze({
    uploadId: fields.uploadId || 'up_' + Date.now().toString(36),
    originalName: fields.originalName || 'unknown',
    filePath: fields.filePath,
    mimeType: fields.mimeType || 'application/octet-stream',
    fileSize: fields.fileSize || 0,
    sha256: fields.sha256 || null,
    width: fields.width || null,
    height: fields.height || null,
    createdAt: new Date().toISOString(),
    status: fields.status || 'PENDING',
  });
}
module.exports = { createUpload: createUpload };