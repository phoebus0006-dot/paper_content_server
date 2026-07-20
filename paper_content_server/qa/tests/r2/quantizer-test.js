#!/usr/bin/env node
// R2.5: Quantizer extraction parity test

var path = require('path');
var ROOT = path.join(__dirname, '..', '..', '..');
var ec = 0, pass = 0, fail = 0;
function t(n,o,d){console.log((o?'PASS':'FAIL')+' '+n+(d?': '+d:''));if(o)pass++;else{ec=1;fail++}}

var q = require(path.join(ROOT, 'src', 'epaper', 'quantizer'));

// 1. clampColor
t('CLAMP_0', q.clampColor(0) === 0, '');
t('CLAMP_255', q.clampColor(255) === 255, '');
t('CLAMP_NEG', q.clampColor(-10) === 0, '');
t('CLAMP_OVER', q.clampColor(300) === 255, '');
t('CLAMP_FLOAT', q.clampColor(127.6) === 127.6, '');

// 2. extractPixels — RGB, 3 channels
var rgb3 = Buffer.alloc(6);
rgb3[0] = 10; rgb3[1] = 20; rgb3[2] = 30;
rgb3[3] = 200; rgb3[4] = 210; rgb3[5] = 220;
var px = q.extractPixels(rgb3, 2, 1, 3);
t('EXTRACT_RGB_LEN', px.length === 6, 'got ' + px.length);
t('EXTRACT_RGB_00', px[0] === 10 && px[1] === 20 && px[2] === 30, '');
t('EXTRACT_RGB_01', px[3] === 200 && px[4] === 210 && px[5] === 220, '');

// 3. extractPixels — RGBA, 4 channels, alpha < 128 = white
var rgba = Buffer.alloc(8);
rgba[0] = 255; rgba[1] = 0; rgba[2] = 0; rgba[3] = 100;  // alpha=100 < 128 → white
rgba[4] = 0; rgba[5] = 255; rgba[6] = 0; rgba[7] = 200;  // alpha=200 >= 128 → green
var pxa = q.extractPixels(rgba, 2, 1, 4);
t('EXTRACT_RGBA_TRANSPARENT', pxa[0] === 255 && pxa[1] === 255 && pxa[2] === 255, 'transparent -> white');
t('EXTRACT_RGBA_OPAQUE', pxa[3] === 0 && pxa[4] === 255 && pxa[5] === 0, 'opaque kept');

// 5. quantizePixel — each palette color
var p = require(path.join(ROOT, 'src', 'epaper', 'palette'));
t('QUANTIZE_BLACK', q.quantizePixel(0,0,0) === 0, '');
t('QUANTIZE_WHITE', q.quantizePixel(255,255,255) === 1, '');
t('QUANTIZE_YELLOW', q.quantizePixel(255,255,0) === 2, '');
t('QUANTIZE_RED', q.quantizePixel(255,0,0) === 3, '');
t('QUANTIZE_BLUE', q.quantizePixel(0,0,255) === 5, '');
t('QUANTIZE_GREEN', q.quantizePixel(0,255,0) === 6, '');

// 6. distributeError — basic test
var pxs = new Float32Array(12);
// pixel (0,0) = 200, some error; distribute to (1,0), (-1,1), (0,1), (1,1)
// width=2, height=2
// pixel (1,0) should get er * 7/16
q.distributeError(pxs, 2, 2, 1, 0, 100, 50, 25, 7/16);
t('DIST_ERROR_10', pxs[3] === 43.75 && pxs[4] === 21.875 && pxs[5] === 10.9375, 'got ' + pxs[3] + ',' + pxs[4] + ',' + pxs[5]);
// out of bounds: should not throw
q.distributeError(pxs, 2, 2, -1, 0, 100, 50, 25, 1);
q.distributeError(pxs, 2, 2, 5, 0, 100, 50, 25, 1);
t('DIST_ERROR_OOB', true, 'no throw');

console.log('\n=== Summary: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(ec);
