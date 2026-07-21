// epf1.js — EPF1 frame encoding
// Mirrors FRAME_HEADER_BYTES, FRAME_PAYLOAD_BYTES, buildFrameBuffer from server.js.
// Do NOT change magic, dimensions, panel, version, nibble packing, or constants.

var palette = require('./palette');

var EPF1_CONSTANTS = {
  MAGIC: 'EPF1',
  WIDTH: 800,
  HEIGHT: 480,
  PANEL: 49,
  VERSION: 1,
  HEADER_BYTES: 10,
  get PAYLOAD_BYTES() { return Math.ceil((this.WIDTH * this.HEIGHT) / 2); },
  get TOTAL_BYTES() { return this.HEADER_BYTES + this.PAYLOAD_BYTES; },
};

function packPixels(leftCode, rightCode) {
  palette.assertAllowedCode(leftCode);
  palette.assertAllowedCode(rightCode);
  return ((leftCode & 0x0F) << 4) | (rightCode & 0x0F);
}

function buildHeader() {
  var header = Buffer.alloc(EPF1_CONSTANTS.HEADER_BYTES);
  header.write(EPF1_CONSTANTS.MAGIC, 0, 4, 'ascii');
  header.writeUInt16LE(EPF1_CONSTANTS.WIDTH, 4);
  header.writeUInt16LE(EPF1_CONSTANTS.HEIGHT, 6);
  header.writeUInt8(EPF1_CONSTANTS.PANEL, 8);
  header.writeUInt8(EPF1_CONSTANTS.VERSION, 9);
  return header;
}

function encodePayload(codes) {
  var totalPixels = EPF1_CONSTANTS.WIDTH * EPF1_CONSTANTS.HEIGHT;
  if (codes.length !== totalPixels) {
    throw new Error('Expected ' + totalPixels + ' codes, got ' + codes.length);
  }
  var payload = Buffer.alloc(EPF1_CONSTANTS.PAYLOAD_BYTES, 0x11);
  for (var i = 0; i < codes.length; i += 2) {
    var left = codes[i];
    var right = (i + 1 < codes.length) ? codes[i + 1] : 1;
    palette.assertAllowedCode(left);
    palette.assertAllowedCode(right);
    payload[i / 2] = packPixels(left, right);
  }
  return payload;
}

function encodeFrame(codes) {
  var payload = encodePayload(codes);
  var header = buildHeader();
  return Buffer.concat([header, payload]);
}

function parseHeader(buffer) {
  if (buffer.length < EPF1_CONSTANTS.HEADER_BYTES) {
    throw new Error('Buffer too short for EPF1 header: got ' + buffer.length + ' bytes, need ' + EPF1_CONSTANTS.HEADER_BYTES);
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
    headerLength: EPF1_CONSTANTS.HEADER_BYTES,
    payloadLength: EPF1_CONSTANTS.PAYLOAD_BYTES,
    frameLength: EPF1_CONSTANTS.TOTAL_BYTES
  };
}

function decodeFrame(frameBuffer) {
  var header = parseHeader(frameBuffer);
  var payload = frameBuffer.slice(header.headerLength, header.headerLength + header.payloadLength);
  var totalPixels = header.width * header.height;
  var pixels = Buffer.alloc(totalPixels * 3);

  for (var i = 0; i < totalPixels; i++) {
    var byteIdx = Math.floor(i / 2);
    var nibble = i % 2 === 0
      ? (payload[byteIdx] >> 4) & 0x0F
      : payload[byteIdx] & 0x0F;
    var color = palette.getPaletteColor(nibble);
    var rgb = color ? color.rgb : [255, 255, 255];
    pixels[i * 3] = rgb[0];
    pixels[i * 3 + 1] = rgb[1];
    pixels[i * 3 + 2] = rgb[2];
  }

  return {
    width: header.width,
    height: header.height,
    pixels: pixels
  };
}

function hexPreview(buf, bytes) {
  bytes = bytes || 32;
  var parts = [];
  for (var i = 0; i < bytes && i < buf.length; i++) {
    parts.push(buf[i].toString(16).padStart(2, '0'));
  }
  return parts.join(' ');
}

module.exports = {
  EPF1_CONSTANTS: EPF1_CONSTANTS,
  packPixels: packPixels,
  buildHeader: buildHeader,
  parseHeader: parseHeader,
  decodeFrame: decodeFrame,
  encodePayload: encodePayload,
  encodeFrame: encodeFrame,
  hexPreview: hexPreview,
};
