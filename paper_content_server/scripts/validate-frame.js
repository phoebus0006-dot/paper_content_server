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

var { validateFrameBuffer } = require(path.join(ROOT, 'src', 'epaper', 'frame-validator'));
var result = validateFrameBuffer(frame);

if (result.ok) {
  console.log('Validator: PASS');
  var code4 = frame[9];
  console.log('Code4: ' + code4 + (code4 === 0 ? ' (OK)' : ' (WARN: non-zero)'));
  process.exit(0);
} else {
  console.log('Validator: FAIL');
  console.log('Errors: ' + (result.errors || []).join('; '));
  process.exit(1);
}
