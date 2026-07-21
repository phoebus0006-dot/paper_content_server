const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const sharp = require('sharp');

const { ImageRecipeService } = require('../../../src/images/image-recipe-service');
const { ImageRasterizer } = require('../../../src/images/image-rasterizer-v2');
const epf1 = require('../../../src/epaper/epf1');
const { imageToFrameBuffer, buildFrameBuffer } = require('../../../src/epaper/image-frame');

const FIXTURE_DIR = path.resolve(__dirname, '../../fixtures');
const TEST_PNG = path.join(FIXTURE_DIR, 'test-input.png');

describe('EPF1 Golden Fixture Verification', () => {
  var recipeService;
  var rasterizer;
  var sourceHash;
  var recipeHash;
  var processedImageHash;
  var frameSha256;
  var frameBuffer;
  var rasterHash;

  before(async () => {
    if (!fs.existsSync(FIXTURE_DIR)) {
      fs.mkdirSync(FIXTURE_DIR, { recursive: true });
    }
    if (!fs.existsSync(TEST_PNG)) {
      await sharp({
        create: {
          width: 100,
          height: 100,
          channels: 3,
          background: { r: 200, g: 100, b: 50 }
        }
      }).png().toFile(TEST_PNG);
    }

    recipeService = new ImageRecipeService();
    rasterizer = new ImageRasterizer({ recipeService: recipeService });

    var recipe = { fitMode: 'contain' };
    var processResult = await recipeService.processImage(TEST_PNG, recipe);
    sourceHash = processResult.sourceHash;
    recipeHash = processResult.recipeHash;
    processedImageHash = processResult.hash;

    var framePayload = imageToFrameBuffer(processResult.buffer, 800, 480, 3, true);
    frameBuffer = buildFrameBuffer(framePayload);
    frameSha256 = crypto.createHash('sha256').update(frameBuffer).digest('hex');

    var rasterResult = await rasterizer.rasterize(TEST_PNG, recipe, { width: 800, height: 480 });
    rasterHash = rasterResult.hash;
  });

  it('magic should be EPF1 (ASCII bytes 0-3)', function() {
    assert.equal(frameBuffer.toString('ascii', 0, 4), 'EPF1');
  });

  it('headerLength should equal 10', function() {
    assert.equal(epf1.EPF1_CONSTANTS.HEADER_BYTES, 10);
  });

  it('width should equal 800', function() {
    assert.equal(frameBuffer.readUInt16LE(4), 800);
    assert.equal(epf1.EPF1_CONSTANTS.WIDTH, 800);
  });

  it('height should equal 480', function() {
    assert.equal(frameBuffer.readUInt16LE(6), 480);
    assert.equal(epf1.EPF1_CONSTANTS.HEIGHT, 480);
  });

  it('panel should equal 0x31', function() {
    assert.equal(frameBuffer.readUInt8(8), 0x31);
    assert.equal(epf1.EPF1_CONSTANTS.PANEL, 0x31);
  });

  it('version should equal 1', function() {
    assert.equal(frameBuffer.readUInt8(9), 1);
    assert.equal(epf1.EPF1_CONSTANTS.VERSION, 1);
  });

  it('payloadLength should equal 192000', function() {
    var expected = Math.ceil((800 * 480) / 2);
    assert.equal(expected, 192000);
    assert.equal(epf1.EPF1_CONSTANTS.PAYLOAD_BYTES, 192000);
  });

  it('frameLength should equal 192010', function() {
    assert.equal(epf1.EPF1_CONSTANTS.TOTAL_BYTES, 192010);
  });

  it('should round-trip verify via parseHeader', function() {
    var parsed = epf1.parseHeader(frameBuffer);
    assert.equal(parsed.magic, 'EPF1');
    assert.equal(parsed.width, 800);
    assert.equal(parsed.height, 480);
    assert.equal(parsed.panel, 0x31);
    assert.equal(parsed.version, 1);
    assert.equal(parsed.headerLength, 10);
    assert.equal(parsed.payloadLength, 192000);
    assert.equal(parsed.frameLength, 192010);

    assert.equal(parsed.magic, frameBuffer.toString('ascii', 0, 4));
    assert.equal(parsed.width, frameBuffer.readUInt16LE(4));
    assert.equal(parsed.height, frameBuffer.readUInt16LE(6));
    assert.equal(parsed.panel, frameBuffer.readUInt8(8));
    assert.equal(parsed.version, frameBuffer.readUInt8(9));
  });

  it('should verify frame buffer size matches TOTAL_BYTES', function() {
    assert.equal(frameBuffer.length, epf1.EPF1_CONSTANTS.TOTAL_BYTES);
    assert.equal(frameBuffer.length, 192010);
  });

  it('rasterizer hash should match direct frameSha256', function() {
    assert.equal(rasterHash, frameSha256);
  });

  it('should log golden fixture data', function() {
    console.log('');
    console.log('=== EPF1 Golden Fixture Data ===');
    console.log('sourceHash:', sourceHash);
    console.log('recipeHash:', recipeHash);
    console.log('processedImageHash:', processedImageHash);
    console.log('frameSha256:', frameSha256);
    console.log('=== End Golden Fixture Data ===');
  });
});
