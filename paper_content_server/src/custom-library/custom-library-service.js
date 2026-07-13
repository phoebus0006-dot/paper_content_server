// custom-library-service.js — Secure upload pipeline
//
// 安全契约:
// - processUpload 不接受客户端提供的任何路径(filePath / absolutePath /
//   relativePath 全部拒绝)。上传内容必须通过 fileBuffer(Buffer)传入,
//   fileBuffer 由 server.js 的 multipart 解析后注入。
// - processUploadStream 接受 Readable stream(流式上传),同样不接受客户端路径。
//   流式写入 quarantine,实时累计 bytesWritten,超限即 abort + cleanup。
// - MIME / width / height / fileSize 一律以服务端真实解码(sharp)为准,
//   不信任客户端声明。
// - quarantine 路径由服务端随机生成(custom-file-store.storeQuarantine / createQuarantineWriteStream)。
// - safety gate 必须存在且 classifier 可用,否则 fail-closed 拒绝。
// - SHA256 流式计算,避免一次性 readFileSync 大文件。
// - 成功响应只返回 assetId,不返回 finalPath(避免泄露内部路径)。
var path = require('path');
var crypto = require('crypto');
var { MAX_FILE_SIZE } = require('./custom-validator');

function createCustomLibraryService(fileStore, validator, deduplicator, safetyGate, assetRepository, logger) {
  logger = logger || {};

  async function processUpload(upload) {
    upload = upload || {};

    // upload.fileBuffer 必须是 Buffer
    if (!Buffer.isBuffer(upload.fileBuffer)) {
      return { status: 'REJECTED', reason: 'INVALID_INPUT', error: 'fileBuffer must be a Buffer' };
    }
    // 不接受 filePath / absolutePath / relativePath
    if (upload.filePath || upload.absolutePath || upload.relativePath) {
      return { status: 'REJECTED', reason: 'INVALID_INPUT', error: 'client-provided paths not accepted' };
    }

    // 1. 初步验证(基于 fileBuffer.length / mimeType / originalName)
    var v = validator.validate({
      fileSize: upload.fileBuffer.length,
      mimeType: upload.mimeType,
      originalName: upload.originalName,
    });
    if (!v.ok) return { status: 'REJECTED', errors: v.errors };

    // 2. 写入 quarantine(服务端生成随机路径,不接受客户端路径)
    var quarantinePath;
    try {
      quarantinePath = fileStore.storeQuarantine(upload.fileBuffer);
    } catch (e) {
      logger.warn && logger.warn('processUpload storeQuarantine failed: ' + e.message);
      return { status: 'ERROR', error: 'QUARANTINE_FAILED' };
    }

    // 3. 真实图像解码(sharp):MIME/width/height/fileSize 来自解码,不来自扩展名
    var decoded;
    try {
      decoded = await fileStore.decodeAndRecompute(quarantinePath);
    } catch (e) {
      fileStore.cleanup(quarantinePath);
      return { status: 'REJECTED', reason: 'DECODE_FAILED', error: e.message };
    }

    // MIME 必须与客户端声明一致(防扩展名伪装)
    if (decoded.mimeType !== upload.mimeType) {
      fileStore.cleanup(quarantinePath);
      return {
        status: 'REJECTED',
        reason: 'MIME_MISMATCH',
        expected: upload.mimeType,
        actual: decoded.mimeType,
      };
    }

    // 4. Safety gate — 必须存在,且 classifier 必须可用
    if (!safetyGate) {
      fileStore.cleanup(quarantinePath);
      return { status: 'ERROR', error: 'DEPENDENCY_UNAVAILABLE', reason: 'SAFETY_GATE_MISSING' };
    }

    var metadata = {
      fileSize: decoded.fileSize,
      mimeType: decoded.mimeType,
      width: decoded.width,
      height: decoded.height,
      originalName: upload.originalName,
    };

    // classifier 返回结构化结果 { decision, scores, modelType, ... } 或
    // 不可用标记 { score: undefined, category: 'UNAVAILABLE', reason }
    var classification;
    try {
      classification = await safetyGate.classify(quarantinePath, metadata);
    } catch (e) {
      fileStore.cleanup(quarantinePath);
      return { status: 'ERROR', error: 'CLASSIFIER_FAILED', reason: e.message };
    }

    // fail-closed:classifier 不可用(无 decision 且无 score)→ FEATURE_NOT_READY
    // 这是 feature 未就绪(无模型/runtime),不是内容拒绝
    var hasDecision = classification && classification.decision !== undefined;
    var hasScore = classification && classification.score !== undefined;
    if (!hasDecision && !hasScore) {
      fileStore.cleanup(quarantinePath);
      return {
        status: 'FEATURE_NOT_READY',
        reason: 'CLASSIFIER_UNAVAILABLE',
        reasonCode: classification ? classification.reason : 'NO_CLASSIFICATION',
      };
    }

    if (!safetyGate.isSafe(classification)) {
      fileStore.cleanup(quarantinePath);
      return { status: 'REJECTED', reason: 'NSFW', classification: classification };
    }

    // 5. SHA256 流式计算(不一次性 readFileSync)
    var sha256;
    try {
      sha256 = await fileStore.computeSha256Stream(quarantinePath);
    } catch (e) {
      fileStore.cleanup(quarantinePath);
      return { status: 'ERROR', error: 'SHA256_FAILED', reason: e.message };
    }

    // 6. Dedup check
    var dup = await deduplicator.isDuplicate(sha256);
    if (dup) {
      fileStore.cleanup(quarantinePath);
      return { status: 'DUPLICATE', sha256: sha256 };
    }

    // 7. 生成 assetId,move to final path
    var am = require(path.join(__dirname, '..', 'assets', 'asset-model'));
    var assetId;
    try {
      // 生成 assetId(localPath='/tmp' 占位,仅用于拿 assetId)
      var tempAsset = am.createAsset({
        sourceUrl: null, localPath: '/tmp', libraryType: 'CUSTOM',
        safetyStatus: 'SAFE', lifecycleStatus: 'SELECTABLE',
      });
      assetId = tempAsset.assetId;
    } catch (e) {
      fileStore.cleanup(quarantinePath);
      return { status: 'ERROR', error: 'ASSET_ID_FAILED: ' + e.message };
    }
    var finalPath;
    try {
      finalPath = fileStore.moveToAssets(quarantinePath, assetId);
    } catch (e) {
      fileStore.cleanup(quarantinePath);
      return { status: 'ERROR', error: 'MOVE_FAILED', reason: e.message };
    }

    // 8. Safety audit — 失败则不得创建资产(rollback finalPath)
    if (safetyGate.audit) {
      try {
        await safetyGate.audit({
          assetId: assetId,
          sha256: sha256,
          model: classification.modelVersion,
          scores: classification.scores,
          decision: 'SAFE',
          timestamp: new Date().toISOString(),
        });
      } catch (e) {
        fileStore.cleanup(finalPath);
        return { status: 'ERROR', error: 'AUDIT_FAILED', reason: e.message };
      }
    }

    // 9. Create asset(使用服务端真实值)
    if (!assetRepository) {
      fileStore.cleanup(finalPath);
      return { status: 'ERROR', error: 'DEPENDENCY_UNAVAILABLE', reason: 'ASSET_REPOSITORY_MISSING' };
    }
    try {
      var asset = am.createAsset({
        assetId: assetId, sourceUrl: null, localPath: finalPath,
        libraryType: 'CUSTOM', sourceType: 'upload',
        sha256: sha256, mimeType: decoded.mimeType,
        width: decoded.width, height: decoded.height,
        safetyStatus: 'SAFE', lifecycleStatus: 'SELECTABLE',
      });
      await assetRepository.create(asset);
      // 不返回 finalPath(避免泄露内部路径)
      return { status: 'ACCEPTED', assetId: assetId };
    } catch (e) {
      fileStore.cleanup(finalPath);
      return { status: 'ERROR', error: 'REPOSITORY_FAILED: ' + e.message };
    }
  }

  // ── 流式上传接口 ──
  // processUploadStream(inputStream, metadata, options)
  //   inputStream: Readable stream(上传的字节流)
  //   metadata: { originalName, mimeType, expectedSize }(可选)
  //   options:  { maxBytes }(可选,用于测试覆盖默认上限)
  //
  // 流程:
  //   1. 预检 expectedSize > maxBytes → REJECTED TOO_LARGE(不创建文件)
  //   2. 创建 quarantine write stream(服务端随机路径,O_EXCL)
  //   3. pipe inputStream → writer.stream,实时累计 bytesWritten
  //      - 超限 → abort(destroy 双向 stream)+ cleanup + REJECTED TOO_LARGE
  //   4. 写完后校验 bytesWritten === expectedSize
  //   5. processAfterQuarantine:decode → classifier → sha256 → dedup → move → audit → repo
  //
  // 返回值不包含 finalPath / quarantinePath(避免泄露内部路径)。
  async function processUploadStream(inputStream, metadata, options) {
    metadata = metadata || {};
    options = options || {};

    if (!inputStream || typeof inputStream.pipe !== 'function') {
      return { status: 'REJECTED', reason: 'INVALID_INPUT', error: 'inputStream must be a Readable' };
    }

    var maxBytes = options.maxBytes || MAX_FILE_SIZE;

    // 1. Content-Length 预检:超限直接拒绝,不创建任何文件
    if (metadata.expectedSize && metadata.expectedSize > maxBytes) {
      return { status: 'REJECTED', reason: 'TOO_LARGE', error: 'Content-Length exceeds limit' };
    }

    // 2. 创建 quarantine write stream
    var writer = fileStore.createQuarantineWriteStream(metadata.expectedSize);
    var bytesWritten = 0;
    var tooLarge = false;

    return new Promise(function (resolve) {
      var settled = false;
      function done(result) {
        if (settled) return;
        settled = true;
        resolve(result);
      }

      // 实时累计已读字节;超限即 abort + cleanup
      inputStream.on('data', function (chunk) {
        bytesWritten += chunk.length;
        if (bytesWritten > maxBytes) {
          tooLarge = true;
          try { inputStream.destroy(); } catch (e) { /* best-effort */ }
          try { writer.stream.destroy(); } catch (e) { /* best-effort */ }
          writer.cleanup(); // unlink 即使 FD 仍打开也能成功(Node 以 FILE_SHARE_DELETE 打开)
          done({ status: 'REJECTED', reason: 'TOO_LARGE', bytesWritten: bytesWritten, limit: maxBytes });
        }
      });

      inputStream.pipe(writer.stream);

      writer.stream.on('finish', function () {
        if (tooLarge) return; // 已 reject
        if (metadata.expectedSize !== undefined && bytesWritten !== metadata.expectedSize) {
          writer.cleanup();
          done({ status: 'REJECTED', reason: 'SIZE_MISMATCH', expected: metadata.expectedSize, actual: bytesWritten });
          return;
        }
        // 继续处理 decode → classify → sha256 → dedup → move → audit → repo
        processAfterQuarantine(writer, metadata).then(done).catch(function (e) {
          writer.cleanup();
          done({ status: 'ERROR', error: e.message });
        });
      });

      writer.stream.on('error', function (e) {
        if (tooLarge) return;
        if (!writer.stream.destroyed) { try { writer.stream.destroy(); } catch (x) { /* best-effort */ } }
        // 等待 writeStream 完全关闭(FD 释放 / 文件已创建)再 cleanup,
        // 否则若 error 在 fs.open 之前触发,unlink 会因文件不存在而静默失败,
        // 随后异步 open 仍会创建 orphan 文件。
        function finalize() {
          writer.cleanup();
          done({ status: 'ERROR', error: 'STREAM_WRITE_FAILED: ' + e.message });
        }
        if (writer.stream.closed) finalize();
        else writer.stream.once('close', finalize);
      });

      inputStream.on('error', function (e) {
        if (tooLarge) return;
        if (!writer.stream.destroyed) { try { writer.stream.destroy(); } catch (x) { /* best-effort */ } }
        function finalize() {
          writer.cleanup();
          done({ status: 'ERROR', error: 'STREAM_READ_FAILED: ' + e.message });
        }
        if (writer.stream.closed) finalize();
        else writer.stream.once('close', finalize);
      });
    });
  }

  // processAfterQuarantine:quarantine 文件写完后的安全处理流水线
  //   decode(fail-closed)→ MIME 校验 → classifier(fail-closed)→ sha256 → dedup → move → audit → repo
  //   每个失败分支都 cleanup(quarantine 或 finalPath),不残留文件。
  async function processAfterQuarantine(writer, metadata) {
    var quarantinePath = writer.path;

    // 1. Sharp decode(fail-closed:解码失败 → REJECTED DECODE_FAILED)
    var decoded;
    try {
      decoded = await fileStore.streamDecode(quarantinePath);
    } catch (e) {
      writer.cleanup();
      return { status: 'REJECTED', reason: 'DECODE_FAILED', error: e.message };
    }

    // MIME 来自解码,不是扩展名;客户端声明与解码不一致 → 拒绝(防伪装)
    if (metadata.mimeType && decoded.mimeType !== metadata.mimeType) {
      writer.cleanup();
      return { status: 'REJECTED', reason: 'MIME_MISMATCH', expected: metadata.mimeType, actual: decoded.mimeType };
    }

    // 2. Classifier(fail-closed:无 gate / classifier 无 score → REJECTED CLASSIFIER_UNAVAILABLE)
    if (!safetyGate) {
      writer.cleanup();
      return { status: 'ERROR', error: 'SAFETY_GATE_MISSING' };
    }

    var classification;
    try {
      classification = await safetyGate.classify(quarantinePath, decoded);
    } catch (e) {
      writer.cleanup();
      return { status: 'FEATURE_NOT_READY', reason: 'CLASSIFIER_UNAVAILABLE', error: e.message };
    }

    // fail-closed:classifier 不可用(无 decision 且无 score)→ FEATURE_NOT_READY
    var hasDecision = classification && classification.decision !== undefined;
    var hasScore = classification && classification.score !== undefined;
    if (!hasDecision && !hasScore) {
      writer.cleanup();
      return {
        status: 'FEATURE_NOT_READY',
        reason: 'CLASSIFIER_UNAVAILABLE',
        reasonCode: classification ? classification.reason : 'NO_CLASSIFICATION',
      };
    }

    if (!safetyGate.isSafe(classification)) {
      writer.cleanup();
      return { status: 'REJECTED', reason: 'NSFW', classification: classification };
    }

    // 3. SHA256 流式
    var sha256;
    try {
      sha256 = await fileStore.streamSha256(quarantinePath);
    } catch (e) {
      writer.cleanup();
      return { status: 'ERROR', error: 'SHA256_FAILED', reason: e.message };
    }

    // 4. Dedup
    var dup = await deduplicator.isDuplicate(sha256);
    if (dup) {
      writer.cleanup();
      return { status: 'DUPLICATE', sha256: sha256 };
    }

    // 5. Move to assets(生成 assetId,原子 rename)
    var assetId = 'asset_' + Date.now().toString(36) + '_' + crypto.randomBytes(4).toString('hex');
    var finalPath;
    try {
      finalPath = fileStore.moveToAssets(quarantinePath, assetId);
    } catch (e) {
      writer.cleanup();
      return { status: 'ERROR', error: 'MOVE_FAILED', reason: e.message };
    }

    // 6. Audit(失败必须 rollback finalPath,不创建资产)
    if (safetyGate.audit) {
      try {
        await safetyGate.audit({
          assetId: assetId,
          sha256: sha256,
          model: classification.modelVersion,
          scores: classification.scores,
          decision: 'SAFE',
          timestamp: new Date().toISOString(),
        });
      } catch (e) {
        // audit 失败 → 删除已 move 的文件,不创建资产
        fileStore.cleanup(finalPath);
        return { status: 'ERROR', error: 'AUDIT_FAILED', reason: e.message };
      }
    }

    // 7. Create asset(不返回 finalPath)
    var am = require(path.join(__dirname, '..', 'assets', 'asset-model'));
    try {
      var asset = am.createAsset({
        assetId: assetId,
        localPath: finalPath,
        libraryType: 'CUSTOM',
        sourceType: 'upload',
        sha256: sha256,
        mimeType: decoded.mimeType,
        width: decoded.width,
        height: decoded.height,
        safetyStatus: 'SAFE',
        lifecycleStatus: 'SELECTABLE',
      });
      await assetRepository.create(asset);
      // 不返回 finalPath(避免泄露内部路径)
      return { status: 'ACCEPTED', assetId: assetId };
    } catch (e) {
      fileStore.cleanup(finalPath);
      return { status: 'ERROR', error: 'REPOSITORY_FAILED', reason: e.message };
    }
  }

  return { processUpload: processUpload, processUploadStream: processUploadStream };
}

module.exports = { createCustomLibraryService: createCustomLibraryService };
