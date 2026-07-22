const path = require('path');
const fs = require('fs');

const ALLOWED_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp']);

class SafeImagePath {
  constructor(options = {}) {
    this.rootDir = path.resolve(options.rootDir || process.cwd());
    this.realRootDir = fs.realpathSync(this.rootDir);
  }

  ensureSafePath(imagePath) {
    if (!imagePath || typeof imagePath !== 'string') {
      return { safe: false, resolved: null, error: 'Input path is required' };
    }

    const resolvedPath = path.isAbsolute(imagePath)
      ? path.resolve(imagePath)
      : path.resolve(this.rootDir, imagePath);

    if (!resolvedPath.startsWith(this.rootDir + path.sep) && resolvedPath !== this.rootDir) {
      return { safe: false, resolved: null, error: 'Path escapes root directory' };
    }

    let realPath;
    try {
      realPath = fs.realpathSync(resolvedPath);
    } catch (err) {
      if (err.code === 'ENOENT') {
        return { safe: false, resolved: null, error: 'File not found' };
      }
      return { safe: false, resolved: null, error: `Cannot resolve path: ${err.message}` };
    }

    if (!realPath.startsWith(this.realRootDir + path.sep) && realPath !== this.realRootDir) {
      return { safe: false, resolved: null, error: 'Resolved path escapes root directory' };
    }

    let stat;
    try {
      stat = fs.statSync(realPath);
    } catch (err) {
      return { safe: false, resolved: null, error: `Cannot stat file: ${err.message}` };
    }

    if (!stat.isFile()) {
      return { safe: false, resolved: null, error: 'Path is not a file' };
    }

    if (stat.isFIFO() || stat.isSocket()) {
      return { safe: false, resolved: null, error: 'Path is a special file type (FIFO/socket)' };
    }

    const ext = path.extname(realPath).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      return { safe: false, resolved: null, error: `Invalid file extension: ${ext}. Allowed: ${[...ALLOWED_EXTENSIONS].join(', ')}` };
    }

    return { safe: true, resolved: realPath, error: null };
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
      if (!ALLOWED_EXTENSIONS.has(ext)) {
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
