const path = require('path');
const fs = require('fs');

class SafeImagePath {
  constructor(options = {}) {
    this.rootDir = options.rootDir || process.cwd();
  }

  isSafe(inputPath) {
    if (!inputPath || typeof inputPath !== 'string') return false;

    // Resolve absolute path
    const resolvedPath = path.isAbsolute(inputPath) ? path.resolve(inputPath) : path.resolve(this.rootDir, inputPath);

    // Prevent directory traversal escape
    if (!resolvedPath.startsWith(this.rootDir + path.sep) && resolvedPath !== this.rootDir) {
      return false;
    }

    try {
      // Must exist
      const stat = fs.lstatSync(resolvedPath);

      // Must be a regular file (no directories, no symlinks, no FIFOs)
      if (!stat.isFile()) return false;
      if (stat.isSymbolicLink()) return false;
      if (stat.isFIFO()) return false;

      // Extensions
      const ext = path.extname(resolvedPath).toLowerCase();
      if (!['.png', '.jpg', '.jpeg', '.webp'].includes(ext)) {
        return false;
      }

      return true;
    } catch (e) {
      // If it doesn't exist or we can't stat it, it's not safe
      return false;
    }
  }

  resolve(inputPath) {
    if (this.isSafe(inputPath)) {
      return path.isAbsolute(inputPath) ? path.resolve(inputPath) : path.resolve(this.rootDir, inputPath);
    }
    throw new Error('Unsafe image path');
  }
}

module.exports = { SafeImagePath };
