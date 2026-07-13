// custom-library-service.js — Secure upload pipeline
//
// 安全契约:
// - processUpload 不接受客户端提供的任何路径(filePath / absolutePath /
//   relativePath 全部拒绝)。上传内容必须通过 fileBuffer(Buffer)传入,
//   fileBuffer 由 server.js 的 multipart 解析后注入。
// - MIME / width / height / fileSize 一律以服务端真实解码(sharp)为准,
//   不信任客户端声明。
// - quarantine 路径由服务端随机生成(custom-file-store.storeQuarantine)。
// - safety gate 必须存在且 classifier 可用,否则 fail-closed 拒绝。
// - SHA256 流式计算,避免一次性 readFileSync 大文件。
// - 成功响应只返回 assetId,不返回 finalPath(避免泄露内部路径)。
var path = require('path');

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

    // classifier 返回 { score, category, modelVersion, scores }
    var classification;
    try {
      classification = await safetyGate.classify(quarantinePath, metadata);
    } catch (e) {
      fileStore.cleanup(quarantinePath);
      return { status: 'ERROR', error: 'CLASSIFIER_FAILED', reason: e.message };
    }

    // fail-closed:classifier 返回空或无 score → 拒绝(FAIL_CLOSED)
    if (!classification || classification.score === undefined) {
      fileStore.cleanup(quarantinePath);
      return { status: 'REJECTED', reason: 'CLASSIFIER_UNAVAILABLE', reasonCode: 'FAIL_CLOSED' };
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

  return { processUpload: processUpload };
}

module.exports = { createCustomLibraryService: createCustomLibraryService };
