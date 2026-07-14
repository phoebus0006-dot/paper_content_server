const assert = require('assert');
const { imageToFrameBuffer } = require('../server');

function rawBuffer(pixels, channels) {
  const buf = Buffer.alloc(pixels.length * channels);
  for (let i = 0; i < pixels.length; i++) {
    const [r, g, b, a = 255] = pixels[i];
    buf[i * channels] = r;
    buf[i * channels + 1] = g;
    buf[i * channels + 2] = b;
    if (channels >= 4) {
      buf[i * channels + 3] = a;
    }
  }
  return buf;
}

const tests = [
  {
    name: 'RGB left black, right white => 0x01',
    pixels: [[0, 0, 0], [255, 255, 255]],
    channels: 3,
    expected: 0x01,
  },
  {
    name: 'RGB left red, right blue => 0x35',
    pixels: [[255, 0, 0], [0, 0, 255]],
    channels: 3,
    expected: 0x35,
  },
  {
    name: 'RGB left white, right black => 0x10',
    pixels: [[255, 255, 255], [0, 0, 0]],
    channels: 3,
    expected: 0x10,
  },
  {
    name: 'RGBA left black, right white => 0x01',
    pixels: [[0, 0, 0, 255], [255, 255, 255, 255]],
    channels: 4,
    expected: 0x01,
  },
  {
    name: 'RGBA left red, right blue => 0x35',
    pixels: [[255, 0, 0, 255], [0, 0, 255, 255]],
    channels: 4,
    expected: 0x35,
  },
  {
    name: 'RGBA transparent pixel treated as white',
    pixels: [[0, 0, 0, 0], [255, 255, 255, 255]],
    channels: 4,
    expected: 0x11,
  },
];

const failures = [];
for (const test of tests) {
  const raw = rawBuffer(test.pixels, test.channels);
  const result = imageToFrameBuffer(raw, test.pixels.length, 1, test.channels);
  const actual = result[0];
  try {
    assert.strictEqual(actual, test.expected, `${test.name}: expected 0x${test.expected.toString(16).padStart(2, '0')}, got 0x${actual.toString(16).padStart(2, '0')}`);
    console.log(`${test.name}: ok 0x${actual.toString(16).padStart(2, '0')}`);
  } catch (error) {
    failures.push(error.message);
    console.error(error.message);
  }
}

if (failures.length) {
  process.exitCode = 1;
  throw new Error(failures.join('; '));
}

console.log('Frame self-test passed');
