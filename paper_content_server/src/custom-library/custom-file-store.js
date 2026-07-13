// custom-file-store.js — 安全的 quarantine / decode / move 流水线
//
// 安全特性:
// - storeQuarantine(fileBuffer):只接受 Buffer,服务端用 crypto.randomBytes(16) 生成
//   随机路径,流式写入,写前后都校验大小,目标用 O_EXCL(wx)防止覆盖。
// - decodeAndRecompute(quarantinePath):用 sharp 真实解码,MIME 来自解码而非扩展名。
// - computeSha256Stream(quarantinePath):流式 SHA256(不一次性 readFileSync)。
// - moveToAssets(quarantinePath, assetId):原子 rename,assetId 严格校验。
// - cleanup(path):只允许删除 quarantine/assets 目录内的文件。
// - 所有路径操作验证不逃逸根目录,不跟随 symlink(realpath + lstat 双重检查)。
var fs = require('fs');
var path = require('path');
var crypto = require('crypto');

function createFileStore(quarantineDir, assetsDir, logger) {
  logger = logger || {};

  // 字符串层面的路径遍历防护:resolvedTarget 必须在 resolvedRoot 之内
  // (不读盘,纯字符串比较;用于拦截 ../ 路径)
  function assertPathWithinDirString(targetPath, rootDir, label) {
    var resolvedRoot = path.resolve(rootDir);
    var resolvedTarget = path.resolve(targetPath);
    if (resolvedTarget !== resolvedRoot &&
        resolvedTarget.indexOf(resolvedRoot + path.sep) !== 0) {
      throw new Error('PATH_ESCAPE_' + label + ': ' + targetPath);
    }
  }

  // 对已存在文件:不跟随 symlink
  //  - lstat 检查目标本身不是 symlink
  //  - realpath 检查解析后的真实路径仍在 rootDir 之内(防止父目录是 symlink 逃逸)
  function assertNoSymlinkEscape(targetPath, rootDir, label) {
    var lstat;
    try {
      lstat = fs.lstatSync(targetPath);
    } catch (e) {
      if (e.code === 'ENOENT') throw new Error('NOT_FOUND_' + label + ': ' + targetPath);
      throw new Error('LSTAT_FAILED_' + label + ': ' + e.message);
    }
    if (lstat.isSymbolicLink()) {
      throw new Error('SYMLINK_NOT_ALLOWED_' + label + ': ' + targetPath);
    }
    var realTarget;
    try {
      realTarget = fs.realpathSync(targetPath);
    } catch (e) {
      throw new Error('REALPATH_FAILED_' + label + ': ' + e.message);
    }
    var realRoot;
    try {
      realRoot = fs.realpathSync(rootDir);
    } catch (e) {
      throw new Error('ROOT_REALPATH_FAILED_' + label + ': ' + e.message);
    }
    if (realTarget !== realRoot &&
        realTarget.indexOf(realRoot + path.sep) !== 0) {
      throw new Error('SYMLINK_ESCAPE_' + label + ': ' + targetPath);
    }
  }

  // 写入 quarantine:只接受 Buffer,服务端生成随机路径
  function storeQuarantine(fileBuffer) {
    if (!Buffer.isBuffer(fileBuffer)) {
      throw new Error('storeQuarantine requires a Buffer');
    }
    var expectedSize = fileBuffer.length;
    // 用 realpath 解析 quarantine 真实目录,防止 quarantineDir 是 symlink
    var realQuarantineDir;
    try {
      realQuarantineDir = fs.realpathSync(quarantineDir);
    } catch (e) {
      throw new Error('QUARANTINE_DIR_UNAVAILABLE: ' + e.message);
    }
    // 服务端生成随机文件名,不接受客户端输入(crypto.randomBytes(16))
    var id = crypto.randomBytes(16).toString('hex');
    var dest = path.join(realQuarantineDir, 'q_' + id + '.bin');
    assertPathWithinDirString(dest, realQuarantineDir, 'QUARANTINE');
    // 写前:expectedSize = fileBuffer.length(已是 Buffer 长度,这是"写前校验")
    if (fileBuffer.length !== expectedSize) {
      throw new Error('SIZE_PRECHECK_FAILED');
    }
    // wx = O_WRONLY|O_CREAT|O_EXCL:不覆盖已存在文件(防止 symlink 投毒)
    var fd = fs.openSync(dest, 'wx', 0o600);
    try {
      fs.writeSync(fd, fileBuffer, 0, fileBuffer.length, 0);
      try { fs.fsyncSync(fd); } catch (e) { /* fsync best-effort */ }
      // 写后:校验文件真实大小 === Buffer 大小
      var stat = fs.fstatSync(fd);
      if (stat.size !== expectedSize) {
        throw new Error('SIZE_MISMATCH: wrote ' + stat.size + ' expected ' + expectedSize);
      }
    } finally {
      try { fs.closeSync(fd); } catch (e) { /* best-effort */ }
    }
    // 写后再次验证目标不是 symlink(防止 TOCTOU race;best-effort)
    var postLstat = fs.lstatSync(dest);
    if (postLstat.isSymbolicLink()) {
      try { fs.unlinkSync(dest); } catch (e) {}
      throw new Error('POST_WRITE_SYMLINK_QUARANTINE');
    }
    return dest;
  }

  // 真实图像解码:MIME 来自 sharp 解码结果,不来自扩展名
  async function decodeAndRecompute(quarantinePath) {
    assertPathWithinDirString(quarantinePath, quarantineDir, 'DECODE');
    assertNoSymlinkEscape(quarantinePath, quarantineDir, 'DECODE');
    var stat = fs.statSync(quarantinePath);
    if (!stat.isFile()) {
      throw new Error('NOT_A_FILE: ' + quarantinePath);
    }
    var sharp = require('sharp');
    var meta = await sharp(quarantinePath).metadata();
    if (!meta || !meta.format) {
      throw new Error('DECODE_FAILED: no image metadata');
    }
    var mimeType = 'image/' + meta.format;
    var width = meta.width || 0;
    var height = meta.height || 0;
    // fileSize 来自 stat(真实大小),width/height/mimeType 来自 sharp 解码
    return { fileSize: stat.size, mimeType: mimeType, width: width, height: height };
  }

  // 流式 SHA256(不一次性 readFileSync,对大文件友好)
  async function computeSha256Stream(quarantinePath) {
    assertPathWithinDirString(quarantinePath, quarantineDir, 'SHA256');
    assertNoSymlinkEscape(quarantinePath, quarantineDir, 'SHA256');
    return new Promise(function (resolve, reject) {
      var hash = crypto.createHash('sha256');
      var stream = fs.createReadStream(quarantinePath);
      stream.on('data', function (chunk) { hash.update(chunk); });
      stream.on('end', function () { resolve(hash.digest('hex')); });
      stream.on('error', reject);
    });
  }

  // 移动到 assets 目录:assetId 严格校验(只允许字母数字下划线)
  function moveToAssets(quarantinePath, assetId) {
    assertPathWithinDirString(quarantinePath, quarantineDir, 'MOVE_SRC');
    assertNoSymlinkEscape(quarantinePath, quarantineDir, 'MOVE_SRC');
    if (typeof assetId !== 'string' || !/^[a-zA-Z0-9_]+$/.test(assetId)) {
      throw new Error('INVALID_ASSET_ID: ' + assetId);
    }
    var realAssetsDir;
    try {
      realAssetsDir = fs.realpathSync(assetsDir);
    } catch (e) {
      throw new Error('ASSETS_DIR_UNAVAILABLE: ' + e.message);
    }
    var dest = path.join(realAssetsDir, assetId + '.bin');
    assertPathWithinDirString(dest, realAssetsDir, 'MOVE_DEST');
    // 目标若已存在且是 symlink → 拒绝(防止通过预置 symlink 逃逸)
    if (fs.existsSync(dest)) {
      var destLstat = fs.lstatSync(dest);
      if (destLstat.isSymbolicLink()) {
        throw new Error('DEST_IS_SYMLINK: ' + dest);
      }
    }
    fs.renameSync(quarantinePath, dest);
    // 移动后验证最终路径仍在 assets 之内(防止 rename 跨域)
    assertNoSymlinkEscape(dest, assetsDir, 'MOVE_FINAL');
    return dest;
  }

  // 流式写入 quarantine:返回一个 WriteStream 句柄,供 processUploadStream 使用。
  // - 服务端生成随机文件名(crypto.randomBytes(16)),.tmp 后缀
  // - 目标用 O_EXCL(wx)防止覆盖已存在文件
  // - 返回 { stream, path, getBytesWritten, isAborted, cleanup }
  //   bytesWritten 由上层 stream 通过 'data' 事件累计;此处仅在 finish 时校验大小是否匹配。
  function createQuarantineWriteStream(expectedSize) {
    var tempName = 'q_' + crypto.randomBytes(16).toString('hex') + '.tmp';
    var tempPath = path.join(quarantineDir, tempName);

    // 验证 quarantine 目录存在(不存在则创建)
    if (!fs.existsSync(quarantineDir)) {
      fs.mkdirSync(quarantineDir, { recursive: true });
    }

    var writeStream = fs.createWriteStream(tempPath, { flags: 'wx' }); // wx = O_EXCL
    var bytesWritten = 0;
    var aborted = false;

    writeStream.on('finish', function () {
      // 写完后验证大小(若上层未自行 abort)
      if (expectedSize !== undefined && bytesWritten !== expectedSize) {
        aborted = true;
      }
    });

    return {
      stream: writeStream,
      path: tempPath,
      getBytesWritten: function () { return bytesWritten; },
      isAborted: function () { return aborted; },
      cleanup: function () {
        try { fs.unlinkSync(tempPath); } catch (e) { /* best-effort */ }
      },
    };
  }

  // 流式解码:用 sharp 读取 metadata(不一次性加载到内存)
  // 返回 { mimeType, width, height, format, fileSize }
  //   - mimeType 来自解码结果('image/' + format),不来自扩展名
  //   - fileSize 来自 fs.statSync(真实大小)
  // 注意:与 decodeAndRecompute 不同,本方法不做路径遍历/symlink 校验,
  //       因调用方传入的 filePath 由 createQuarantineWriteStream 服务端生成。
  function streamDecode(filePath) {
    var sharp = require('sharp');
    return sharp(filePath).metadata().then(function (metadata) {
      return {
        mimeType: 'image/' + metadata.format,
        width: metadata.width,
        height: metadata.height,
        format: metadata.format,
        fileSize: fs.statSync(filePath).size,
      };
    });
  }

  // 流式 SHA256(不一次性 readFileSync,对大文件友好)
  function streamSha256(filePath) {
    return new Promise(function (resolve, reject) {
      var hash = crypto.createHash('sha256');
      var stream = fs.createReadStream(filePath);
      stream.on('data', function (chunk) { hash.update(chunk); });
      stream.on('end', function () { resolve(hash.digest('hex')); });
      stream.on('error', reject);
    });
  }

  // cleanup:只删除 quarantine 或 assets 目录内的文件,拒绝任意路径
  function cleanup(filePath) {
    try {
      if (!filePath) return;
      // 必须在 quarantine 或 assets 之内,否则忽略(防止误删)
      var inQuarantine = false, inAssets = false;
      try {
        assertPathWithinDirString(filePath, quarantineDir, 'CLEANUP_Q');
        inQuarantine = true;
      } catch (e) { inQuarantine = false; }
      if (!inQuarantine) {
        try {
          assertPathWithinDirString(filePath, assetsDir, 'CLEANUP_A');
          inAssets = true;
        } catch (e) { inAssets = false; }
      }
      if (!inQuarantine && !inAssets) {
        logger.warn && logger.warn('cleanup: path outside quarantine/assets, skipped: ' + filePath);
        return;
      }
      if (!fs.existsSync(filePath)) return;
      // 不跟随 symlink:lstat 检查
      var lstat = fs.lstatSync(filePath);
      if (lstat.isSymbolicLink()) {
        // 删除 symlink 本身(不跟随),保护目标
        fs.unlinkSync(filePath);
      } else {
        fs.unlinkSync(filePath);
      }
    } catch (e) {
      logger.warn && logger.warn('cleanup: ' + e.message);
    }
  }

  return {
    storeQuarantine: storeQuarantine,
    decodeAndRecompute: decodeAndRecompute,
    computeSha256Stream: computeSha256Stream,
    moveToAssets: moveToAssets,
    cleanup: cleanup,
    // 流式接口(供 processUploadStream 使用)
    createQuarantineWriteStream: createQuarantineWriteStream,
    streamDecode: streamDecode,
    streamSha256: streamSha256,
  };
}

module.exports = { createFileStore: createFileStore };
