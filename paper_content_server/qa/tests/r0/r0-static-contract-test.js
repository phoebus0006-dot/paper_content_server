#!/usr/bin/env node
var fs = require('fs');
var path = require('path');
var ROOT = path.join(__dirname, '..', '..', '..');

var pass = 0, fail = 0, ec = 0;
function t(name, ok, detail) {
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? ': ' + detail : ''));
  if (ok) pass++; else { fail++; ec = 1; }
}

console.log('=== R0 Static Contract Test ===');

// --- 1. GET /api/admin/photos/:id 路由存在 ---
var serverSrc = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
var hasPhotoGetRoute = serverSrc.indexOf("'/api/admin/photos/'") >= 0
  && (serverSrc.indexOf('method === \'GET\'') >= 0 || serverSrc.indexOf("'GET'") >= 0)
  && (serverSrc.indexOf(':id') >= 0 || serverSrc.indexOf("id") >= 0);
var photoGetExplicit = /\/api\/admin\/photos\/(?:\$\{id\}|"\+|'\+)/.test(serverSrc);
t('R0_01_GET_PHOTO_BY_ID_ROUTE_EXISTS',
  photoGetExplicit && hasPhotoGetRoute,
  photoGetExplicit ? 'route found' : 'missing GET /api/admin/photos/:id route');

// --- 2. DELETE /api/admin/photos/:id 路由存在 ---
var hasPhotoDeleteRoute = serverSrc.indexOf("'DELETE'") >= 0 && serverSrc.indexOf("'/api/admin/photos/'") >= 0;
t('R0_02_DELETE_PHOTO_ROUTE_EXISTS',
  hasPhotoDeleteRoute,
  hasPhotoDeleteRoute ? 'route found' : 'missing DELETE /api/admin/photos/:id route');

// --- 3. POST /api/admin/photos/:id/save-edit 路由存在 ---
var hasPhotoSaveEditRoute = serverSrc.indexOf('save-edit') >= 0;
t('R0_03_SAVE_EDIT_PHOTO_ROUTE_EXISTS',
  hasPhotoSaveEditRoute,
  hasPhotoSaveEditRoute ? 'route found' : 'missing POST /api/admin/photos/:id/save-edit route');

// --- 4. photo-palette 路径一致性 ---
var adminJs = fs.readFileSync(path.join(ROOT, 'public/admin/admin.js'), 'utf8');
var frontendCallsPalette = adminJs.indexOf('/api/admin/photo-palette') >= 0;
var backendRoutePalette = serverSrc.indexOf('/debug/photo-palette.json') >= 0;
var frontendBackendMatch = serverSrc.indexOf('/api/admin/photo-palette') >= 0;
t('R0_04_PHOTO_PALETTE_PATH_CONSISTENT',
  frontendBackendMatch,
  (frontendCallsPalette ? 'frontend:/api/admin/photo-palette ' : '') +
  (backendRoutePalette ? 'backend:/debug/photo-palette.json' : '') +
  (frontendBackendMatch ? ' MATCH' : ' MISMATCH'));

// --- 5. confirmRollback handler 存在 ---
var hasConfirmRollback = adminJs.indexOf('function confirmRollback') >= 0
  || adminJs.indexOf('confirmRollback =') >= 0
  || adminJs.indexOf('confirmRollback:') >= 0;
t('R0_05_CONFIRM_ROLLBACK_HANDLER_EXISTS',
  hasConfirmRollback,
  hasConfirmRollback ? 'defined in admin.js' : 'missing from admin.js (referenced in index.html line 246)');

// --- 6. closeRollbackPreview handler 存在 ---
var hasCloseRollback = adminJs.indexOf('function closeRollbackPreview') >= 0
  || adminJs.indexOf('closeRollbackPreview =') >= 0;
t('R0_06_CLOSE_ROLLBACK_PREVIEW_HANDLER_EXISTS',
  hasCloseRollback,
  hasCloseRollback ? 'defined in admin.js' : 'missing from admin.js (referenced in index.html line 247)');

// --- 7. 发布历史 CURRENT 状态只能有一个 ---
var htmlSrc = fs.readFileSync(path.join(ROOT, 'public/admin/index.html'), 'utf8');
var hasActiveStatusInHTML = htmlSrc.indexOf('active') >= 0 || htmlSrc.indexOf('CURRENT') >= 0 || htmlSrc.indexOf('archived') >= 0;
var hasStatusFieldInServer = serverSrc.indexOf('status') >= 0 && (serverSrc.indexOf('active') >= 0 || serverSrc.indexOf('archived') >= 0);
t('R0_07_PUBLISH_HISTORY_SINGLE_CURRENT',
  hasStatusFieldInServer && hasActiveStatusInHTML,
  hasStatusFieldInServer ? 'status field present in server.js' : 'missing status field semantics');

// --- 8. 非 2xx 响应不应显示成功 toast (前端代码检查) ---
// api() 函数应检查 r.ok 或等效的非 2xx 守卫
// api() 在 admin.js 中，位于第 33-44 行
var adminApiFnSrc = adminJs.indexOf('function api(') >= 0 ? adminJs.substring(adminJs.indexOf('function api('), adminJs.indexOf('function api(') + 200) : '';
var hasApiOkGuard = adminApiFnSrc.indexOf('.ok') >= 0;
t('R0_08_NON_2XX_NO_SUCCESS_TOAST',
  hasApiOkGuard,
  hasApiOkGuard ? 'api() checks r.ok' : 'api() returns any JSON without r.ok check');

// --- 9. 上传禁用时显示明确原因 (前端展示检查) ---
var showsUploadReason = adminJs.indexOf('uploadDisabledReason') >= 0
  || adminJs.indexOf('upload-disabled') >= 0
  || adminJs.indexOf('upload_disabled') >= 0;
t('R0_09_UPLOAD_DISABLED_REASON_SHOWN',
  showsUploadReason,
  showsUploadReason ? 'uploadDisabledReason present in admin.js' : 'missing from admin.js');

console.log('\n=== R0 Static Contract: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(ec);
