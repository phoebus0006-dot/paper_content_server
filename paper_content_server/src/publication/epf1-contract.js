// epf1-contract.js — Authoritative EPF1 protocol contract & full-frame SHA256 definition
// Single source of truth for header fields, constants, validation, and SHA256 semantics.

var crypto = require('crypto');

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
  var frameValidator = require('../epaper/frame-validator');
  return frameValidator.validateFrameBuffer(buffer);
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
