#!/usr/bin/env node
// R2.4: Palette extraction parity test
// Compares against epaperPalette.PALETTE (extracted from production).

var path = require('path');
var ROOT = path.join(__dirname, '..', '..');
var ec = 0, pass = 0, fail = 0;
function t(n,o,d){console.log((o?'PASS':'FAIL')+' '+n+(d?': '+d:''));if(o)pass++;else{ec=1;fail++}}

var epaperPalette = require(path.join(ROOT, 'src', 'epaper', 'palette'));

// Production reference: the module itself IS the production reference
var prodPalette = epaperPalette.PALETTE;

// 1. Palette length
t('PALETTE_LENGTH', epaperPalette.PALETTE.length === 6, 'got ' + epaperPalette.PALETTE.length);

// 2. Palette exact values
var expected = [
  { code: 0, name: 'black', rgb: [0, 0, 0] },
  { code: 1, name: 'white', rgb: [255, 255, 255] },
  { code: 2, name: 'yellow', rgb: [255, 255, 0] },
  { code: 3, name: 'red', rgb: [255, 0, 0] },
  { code: 5, name: 'blue', rgb: [0, 0, 255] },
  { code: 6, name: 'green', rgb: [0, 255, 0] },
];
var paletteMatch = true;
for (var i = 0; i < expected.length; i++) {
  var a = epaperPalette.PALETTE[i];
  var b = expected[i];
  if (a.code !== b.code || a.name !== b.name || a.rgb[0] !== b.rgb[0] || a.rgb[1] !== b.rgb[1] || a.rgb[2] !== b.rgb[2]) {
    paletteMatch = false; break;
  }
}
t('PALETTE_EXACT_MATCH', paletteMatch, '');

// 3. ALLOWED_CODES
t('ALLOWED_CODES', epaperPalette.ALLOWED_CODES.join(',') === '0,1,2,3,5,6', '');

// 4. isAllowedCode
t('IS_ALLOWED_0', epaperPalette.isAllowedCode(0) === true, '');
t('IS_ALLOWED_1', epaperPalette.isAllowedCode(1) === true, '');
t('IS_ALLOWED_4', epaperPalette.isAllowedCode(4) === false, '');
t('IS_ALLOWED_7', epaperPalette.isAllowedCode(7) === false, '');

// 5. assertAllowedCode
var assertOk = true;
try { epaperPalette.assertAllowedCode(0); } catch(e) { assertOk = false; }
try { epaperPalette.assertAllowedCode(1); } catch(e) { assertOk = false; }
try { epaperPalette.assertAllowedCode(3); } catch(e) { assertOk = false; }
t('ASSERT_ALLOWED_VALID', assertOk, '');
var assertThrew = false;
try { epaperPalette.assertAllowedCode(4); } catch(e) { assertThrew = true; }
t('ASSERT_ALLOWED_CODE4', assertThrew, '');

// 6. getPaletteColor
t('GET_COLOR_BLACK', epaperPalette.getPaletteColor(0).name === 'black', '');
t('GET_COLOR_WHITE', epaperPalette.getPaletteColor(1).name === 'white', '');
t('GET_COLOR_NULL', epaperPalette.getPaletteColor(99) === null, '');

// 7. nearestPaletteCode: each palette color maps to itself
var nearestOk = true;
for (var j = 0; j < prodPalette.length; j++) {
  var c = prodPalette[j];
  if (epaperPalette.nearestPaletteCode(c.rgb[0], c.rgb[1], c.rgb[2]) !== c.code) { nearestOk = false; break; }
}
t('NEAREST_SELF', nearestOk, '');

// 8. Specific color tests
t('NEAREST_BLACK', epaperPalette.nearestPaletteCode(0,0,0) === 0, '');
t('NEAREST_WHITE', epaperPalette.nearestPaletteCode(255,255,255) === 1, '');
t('NEAREST_RED', epaperPalette.nearestPaletteCode(255,0,0) === 3, '');
t('NEAREST_BLUE', epaperPalette.nearestPaletteCode(0,0,255) === 5, '');
t('NEAREST_GREEN', epaperPalette.nearestPaletteCode(0,255,0) === 6, '');
t('NEAREST_YELLOW', epaperPalette.nearestPaletteCode(255,255,0) === 2, '');

// 9. Gray pixels
t('NEAREST_GRAY_128', epaperPalette.nearestPaletteCode(128,128,128) === 1, 'mid gray -> white');
t('NEAREST_GRAY_64', epaperPalette.nearestPaletteCode(64,64,64) === 0, 'dark gray -> black');

console.log('\n=== Summary: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(ec);
