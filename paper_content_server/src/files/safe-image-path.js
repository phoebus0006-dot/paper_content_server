const path = require('path');
const fs = require('fs');

class SafeImagePath {
  constructor(options = {}) {
    this.rootDir = path.resolve(options.rootDir || process.cwd());
    this.realRootDir = fs.realpathSync(this.rootDir);
  }

  isSafe(inputPath) {
    if (!inputPath || typeof inputPath !== 'string') return false;

    const resolvedPath = path.isAbsolute(inputPath)
      ? path.resolve(inputPath)
      : path.resolve(this.rootDir, inputPath);

    if (!resolvedPath.startsWith(this.rootDir + path.sep) && resolvedPath !== this.rootDir) {
      return false;
    }

    try {
      const realPath = fs.realpathSync(resolvedPath);

      if (!realPath.startsWith(this.realRootDir + path.sep) && realPath !== this.realRootDir) {
        return false;
      }

      const stat = fs.statSync(realPath);

      if (!stat.isFile()) return false;
      if (stat.isFIFO() || stat.isSocket()) return false;

      const ext = path.extname(realPath).toLowerCase();
      if (!['.png', '.jpg', '.jpeg', '.webp'].includes(ext)) {
        return false;
      }

      return true;
    } catch (e) {
      return false;
    }
  }

  resolve(inputPath) {
    if (this.isSafe(inputPath)) {
      const resolvedPath = path.isAbsolute(inputPath)
        ? path.resolve(inputPath)
        : path.resolve(this.rootDir, inputPath);
      return fs.realpathSync(resolvedPath);
    }
    throw new Error('Unsafe image path');
  }
}

module.exports = { SafeImagePath };
