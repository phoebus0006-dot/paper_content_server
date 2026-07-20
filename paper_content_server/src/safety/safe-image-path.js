var path = require('path');

function validateSafeImagePath(rawPath, allowedDirs) {
  if (typeof rawPath !== 'string') {
    throw new Error('Path must be a string');
  }
  if (rawPath.indexOf('\0') !== -1) {
    throw new Error('Path contains null bytes');
  }
  if (rawPath.indexOf('..') !== -1) {
    throw new Error('Path contains directory traversal (..)');
  }

  var resolvedPath = path.resolve(rawPath);

  if (!allowedDirs || allowedDirs.length === 0) {
    return resolvedPath; // No allowlist provided, just block traversal
  }

  var isAllowed = false;
  for (var i = 0; i < allowedDirs.length; i++) {
    var allowedDir = path.resolve(allowedDirs[i]);
    if (resolvedPath.startsWith(allowedDir + path.sep) || resolvedPath === allowedDir) {
      isAllowed = true;
      break;
    }
  }

  if (!isAllowed) {
    throw new Error('Path is not within allowed directories: ' + resolvedPath);
  }

  return resolvedPath;
}

module.exports = {
  validateSafeImagePath: validateSafeImagePath
};
