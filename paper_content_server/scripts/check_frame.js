const http = require('http');
const sharp = require('sharp');
const path = require('path');

const { imageToFrameBuffer } = require('../server.js');

function getBuffer(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    }).on('error', reject);
  });
}

function getJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(JSON.parse(data)));
    }).on('error', reject);
  });
}

// Test 1: check current frame.bin from server
async function testServerFrame() {
  const info = await getJson('http://localhost:8787/debug/photo-info.json');
  console.log('Photo:', info.imageName, info.imageTheme, info.imageStatus);

  const frame = await getBuffer('http://localhost:8787/api/frame.bin');
  console.log('Frame: magic=%s, width=%d, height=%d, panel=%d, len=%d',
    frame.slice(0,4).toString(), frame.readUInt16LE(4), frame.readUInt16LE(6), frame[8], frame.length);

  const codes = new Set();
  for (let i = 10; i < frame.length; i++) {
    codes.add(frame[i] >> 4);
    codes.add(frame[i] & 0x0F);
  }
  const sorted = [...codes].sort((a, b) => a - b);
  console.log('Frame pixel codes present:', sorted.join(', '));
}

// Test 2: create a synthetic color test image and run through imageToFrameBuffer
async function testColorQuantization() {
  // Create a test SVG with red, green, blue, yellow, black, white blocks
  const svg = Buffer.from(`<svg width="800" height="480" xmlns="http://www.w3.org/2000/svg">
    <rect x="0" y="0" width="400" height="160" fill="red"/>
    <rect x="400" y="0" width="400" height="160" fill="green"/>
    <rect x="0" y="160" width="400" height="160" fill="blue"/>
    <rect x="400" y="160" width="400" height="160" fill="yellow"/>
    <rect x="0" y="320" width="400" height="160" fill="black"/>
    <rect x="400" y="320" width="400" height="160" fill="white"/>
  </svg>`);

  const { data, info } = await sharp(svg)
    .resize(800, 480, { fit: 'fill' })
    .flatten({ background: '#ffffff' })
    .raw()
    .toBuffer({ resolveWithObject: true });

  console.log('Test image: %dx%d, %d channels', info.width, info.height, info.channels);

  const payload = imageToFrameBuffer(data, info.width, info.height, info.channels);
  console.log('Payload length:', payload.length);

  // Sample pixels from each region
  const getCode = (x, y) => {
    const idx = y * 800 + x;
    const byteIdx = Math.floor(idx / 2);
    const b = payload[byteIdx];
    return (idx % 2 === 0) ? (b >> 4) : (b & 0x0F);
  };

  // Read pixel at center of each color block
  const samples = [
    { x: 200, y: 80, label: 'red block' },
    { x: 600, y: 80, label: 'green block' },
    { x: 200, y: 240, label: 'blue block' },
    { x: 600, y: 240, label: 'yellow block' },
    { x: 200, y: 400, label: 'black block' },
    { x: 600, y: 400, label: 'white block' },
  ];
  for (const s of samples) {
    const code = getCode(s.x, s.y);
    const names = ['black','white','yellow','red','?','blue','green'];
    console.log('  %s (x=%d,y=%d) → code=%d = %s', s.label, s.x, s.y, code, names[code] || 'unknown');
  }

  const allCodes = new Set();
  for (let i = 0; i < payload.length; i++) {
    allCodes.add(payload[i] >> 4);
    allCodes.add(payload[i] & 0x0F);
  }
  console.log('All codes in payload:', [...allCodes].sort((a,b)=>a-b).join(', '));
}

async function main() {
  console.log('=== Test 1: Server frame ===');
  await testServerFrame();
  console.log('\n=== Test 2: Color quantization ===');
  await testColorQuantization();
}

main().catch(e => console.error(e));
