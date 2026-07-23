// epf1-contract.js — Authoritative EPF1 protocol contract, validation & full-frame SHA256 definition
// Single source of truth for header fields, constants, validation, and SHA256 semantics.

var crypto = require('crypto');
var palette = require('../epaper/palette');

var EPF1_MAGIC = 'EPF1';
var EPF1_HEADER_LENGTH = 10;
var EPF1_WIDTH = 800;
var EPF1_HEIGHT = 480;
var EPF1_PANEL_CODE = 49;
var EPF1_VERSION = 1;
var EPF1_PAYLOAD_LENGTH = 192000;
var EPF1_FRAME_LENGTH = 192010;

function parseEpf1Header(buffer) {
  if (!Buffer.isBuffer(buffer)) {
    throw new TypeError('Expected buffer for EPF1 header parsing');
  }
  if (buffer.length < EPF1_HEADER_LENGTH) {
    throw new Error('Buffer too short for EPF1 header: got ' + buffer.length + ' bytes, need ' + EPF1_HEADER_LENGTH);
  }
  var magic = buffer.toString('ascii', 0, 4);
  var width = buffer.readUInt16LE(4);
  var height = buffer.readUInt16LE(6);
  var panel = buffer.readUInt8(8);
  var version = buffer.readUInt8(9);
  return {
    magic: magic,
    width: width,
    height: height,
    panel: panel,
    version: version,
    headerLength: EPF1_HEADER_LENGTH,
    payloadLength: EPF1_PAYLOAD_LENGTH,
    frameLength: EPF1_FRAME_LENGTH,
  };
}

function validateEpf1Frame(buffer) {
  var errors = [];
  if (!Buffer.isBuffer(buffer)) {
    return { ok: false, errors: ['Input is not a Buffer'], header: null, invalidCodeCount: 0, code4Count: 0 };
  }

  if (buffer.length < EPF1_HEADER_LENGTH) {
    errors.push('Length: expected ' + EPF1_FRAME_LENGTH + ' got ' + buffer.length);
    errors.push('Header too short: got ' + buffer.length + ' bytes, expected at least ' + EPF1_HEADER_LENGTH);
    return { ok: false, errors: errors, header: null, invalidCodeCount: 0, code4Count: 0 };
  }

  if (buffer.length !== EPF1_FRAME_LENGTH) {
    errors.push('Length: expected ' + EPF1_FRAME_LENGTH + ' got ' + buffer.length);
  }

  var magic = buffer.toString('ascii', 0, 4);
  if (magic !== EPF1_MAGIC) {
    errors.push('Magic: expected "' + EPF1_MAGIC + '" got "' + magic + '"');
  }

  var width = buffer.readUInt16LE(4);
  if (width !== EPF1_WIDTH) {
    errors.push('Width: expected ' + EPF1_WIDTH + ' got ' + width);
  }

  var height = buffer.readUInt16LE(6);
  if (height !== EPF1_HEIGHT) {
    errors.push('Height: expected ' + EPF1_HEIGHT + ' got ' + height);
  }

  var panel = buffer.readUInt8(8);
  if (panel !== EPF1_PANEL_CODE) {
    errors.push('Panel: expected ' + EPF1_PANEL_CODE + ' got ' + panel);
  }

  var version = buffer.readUInt8(9);
  if (version !== EPF1_VERSION) {
    errors.push('Version: expected ' + EPF1_VERSION + ' got ' + version);
  }

  var invalidCodeCount = 0;
  var code4Count = 0;
  var payloadEnd = EPF1_HEADER_LENGTH + EPF1_PAYLOAD_LENGTH;
  var validEnd = Math.min(buffer.length, payloadEnd);

  for (var i = EPF1_HEADER_LENGTH; i < validEnd; i++) {
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

function computeEpf1FrameSha256(buffer) {
  if (!Buffer.isBuffer(buffer)) {
    throw new TypeError('Expected buffer for EPF1 frame SHA256 computation');
  }
  if (buffer.length !== EPF1_FRAME_LENGTH) {
    throw new Error('computeEpf1FrameSha256 requires full EPF1 frame of ' + EPF1_FRAME_LENGTH + ' bytes, got ' + buffer.length);
  }
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

module.exports = {
  EPF1_MAGIC: EPF1_MAGIC,
  EPF1_HEADER_LENGTH: EPF1_HEADER_LENGTH,
  EPF1_WIDTH: EPF1_WIDTH,
  EPF1_HEIGHT: EPF1_HEIGHT,
  EPF1_PANEL_CODE: EPF1_PANEL_CODE,
  EPF1_VERSION: EPF1_VERSION,
  EPF1_PAYLOAD_LENGTH: EPF1_PAYLOAD_LENGTH,
  EPF1_FRAME_LENGTH: EPF1_FRAME_LENGTH,

  parseEpf1Header: parseEpf1Header,
  validateEpf1Frame: validateEpf1Frame,
  computeEpf1FrameSha256: computeEpf1FrameSha256,
};
