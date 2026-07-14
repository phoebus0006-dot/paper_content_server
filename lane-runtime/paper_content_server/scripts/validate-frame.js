#!/usr/bin/env node
var path = require('path');
var fs = require('fs');
var ROOT = path.join(__dirname, '..');

var filePath = process.argv[2];
if (!filePath) {
  console.error('Usage: node scripts/validate-frame.js <frame.bin>');
  process.exit(1);
}

var frame;
try {
  frame = fs.readFileSync(filePath);
} catch(e) {
  console.error('FAIL: cannot read ' + filePath + ' — ' + e.message);
  process.exit(1);
}

console.log('Frame: ' + path.basename(filePath));
console.log('Length: ' + frame.length);
console.log('Magic: ' + frame.slice(0, 4).toString());
console.log('Width: ' + frame.readUInt16LE(4));
console.log('Height: ' + frame.readUInt16LE(6));
console.log('Panel: ' + frame.readUInt8(8));
console.log('Version: ' + frame.readUInt8(9));

var { validateFrameBuffer } = require(path.join(ROOT, 'src', 'epaper', 'frame-validator'));
var result = validateFrameBuffer(frame);

console.log('InvalidCodeCount: ' + (result.invalidCodeCount !== undefined ? result.invalidCodeCount : 'N/A'));
console.log('Code4Count: ' + (result.code4Count !== undefined ? result.code4Count : frame.readUInt8(9)));

if (result.ok && (result.code4Count === undefined || result.code4Count === 0)) {
  console.log('Validator: PASS');
  process.exit(0);
} else {
  console.log('Validator: FAIL');
  if (result.errors) console.log('Errors: ' + result.errors.join('; '));
  if (result.code4Count !== undefined && result.code4Count > 0) console.log('Non-zero code4 count: ' + result.code4Count);
  process.exit(1);
}
