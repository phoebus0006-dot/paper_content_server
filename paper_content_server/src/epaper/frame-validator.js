var palette = require('./palette');
var epf1Contract = require('../publication/epf1-contract');

function validateFrameBuffer(buffer) {
  var errors = [];
  var C = {
    TOTAL_BYTES: epf1Contract.EPF1_FRAME_LENGTH,
    MAGIC: epf1Contract.EPF1_MAGIC,
    WIDTH: epf1Contract.EPF1_WIDTH,
    HEIGHT: epf1Contract.EPF1_HEIGHT,
    PANEL: epf1Contract.EPF1_PANEL_CODE,
    VERSION: epf1Contract.EPF1_VERSION,
    HEADER_BYTES: epf1Contract.EPF1_HEADER_LENGTH,
    PAYLOAD_BYTES: epf1Contract.EPF1_PAYLOAD_LENGTH,
  };

  if (!Buffer.isBuffer(buffer)) {
    return { ok: false, errors: ['Input is not a Buffer'], header: null, invalidCodeCount: 0, code4Count: 0 };
  }

  if (buffer.length !== C.TOTAL_BYTES) {
    errors.push('Length: expected ' + C.TOTAL_BYTES + ' got ' + buffer.length);
  }

  var magic = buffer.slice(0, 4).toString('ascii');
  if (magic !== C.MAGIC) {
    errors.push('Magic: expected "' + C.MAGIC + '" got "' + magic + '"');
  }

  var width = buffer.readUInt16LE(4);
  if (width !== C.WIDTH) {
    errors.push('Width: expected ' + C.WIDTH + ' got ' + width);
  }

  var height = buffer.readUInt16LE(6);
  if (height !== C.HEIGHT) {
    errors.push('Height: expected ' + C.HEIGHT + ' got ' + height);
  }

  var panel = buffer.readUInt8(8);
  if (panel !== C.PANEL) {
    errors.push('Panel: expected ' + C.PANEL + ' got ' + panel);
  }

  var version = buffer.readUInt8(9);
  if (version !== C.VERSION) {
    errors.push('Version: expected ' + C.VERSION + ' got ' + version);
  }

  var invalidCodeCount = 0;
  var code4Count = 0;
  var payloadEnd = C.HEADER_BYTES + C.PAYLOAD_BYTES;
  var validEnd = Math.min(buffer.length, payloadEnd);

  for (var i = C.HEADER_BYTES; i < validEnd; i++) {
    var left = (buffer[i] >> 4) & 0x0F;
    var right = buffer[i] & 0x0F;
    if (!palette.isAllowedCode(left)) {
      invalidCodeCount++;
      if (left === 4) code4Count++;
    }
    if (!palette.isAllowedCode(right)) {
      invalidCodeCount++;
      if (right === 4) code4Count++;
    }
  }

  if (invalidCodeCount > 0) {
    errors.push('Invalid codes: ' + invalidCodeCount + ' (code4=' + code4Count + ')');
  }

  return {
    ok: errors.length === 0,
    errors: errors,
    header: {
      magic: magic,
      width: width,
      height: height,
      panel: panel,
      version: version,
    },
    invalidCodeCount: invalidCodeCount,
    code4Count: code4Count,
  };
}

module.exports = { validateFrameBuffer: validateFrameBuffer };
