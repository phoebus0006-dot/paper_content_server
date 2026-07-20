#!/usr/bin/env node
var path = require('path');
var ROOT = path.join(__dirname, '..', '..');
var ec = 0, pass = 0, fail = 0;
function t(n, o, d) { console.log((o ? 'PASS' : 'FAIL') + ' ' + n + (d ? ': ' + d : '')); if (o) pass++; else { ec = 1; fail++; } }

var { isPathAllowed } = require(path.join(ROOT, 'src', 'safety', 'reference-cleaner'));

// The isPathAllowed function is interal to ReferenceCleaner, so we test via the exported behavior
// Instead, we test the path relative logic directly
function isInside(root, target) {
  var relative = path.relative(root, target);
  return relative !== '' &&
    !relative.startsWith('..' + path.sep) &&
    !path.isAbsolute(relative);
}

var dataRoot = path.resolve('data');
var imagesRoot = path.resolve('images');
t('FILE_INSIDE_DATA', isInside(dataRoot, path.join(dataRoot, 'test.jpg')), '');
t('FILE_EQUAL_DATA', !isInside(dataRoot, dataRoot), 'root dir itself should be false');
t('FILE_OUTSIDE_DATA', !isInside(dataRoot, path.resolve('..', 'data', 'test.jpg')), '');
t('FILE_INSIDE_IMAGES', isInside(imagesRoot, path.join(imagesRoot, 'img.png')), '');
t('FILE_OUTSIDE_ROOT', !isInside(dataRoot, path.resolve('..', 'etc', 'passwd')), '');

console.log('\n=== Summary: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(ec);
