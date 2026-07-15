# 管理后台功能审计报告

## 概述

审计日期: 2026-07-15
审计范围: `public/admin/index.html`, `public/admin/admin.js`, `server.js`
审计类型: 全量按钮矩阵审计 + 前端Handler检查 + 后端路由存在性检查

## 总统计

| 指标 | 数量 |
|------|------|
| 总控件数 (CSV行数) | 73 |
| PASS (正常工作) | 62 |
| FAIL (存在问题) | 11 |
| - FRONTEND_HANDLER_MISSING | 2 |
| - BACKEND_ROUTE_MISSING | 5 |
| - INFINITE_LOADING | 1 |
| - EMPTY_SELECTOR | 2 |

---

## 失败项详细清单

### 1. INFINITE_LOADING - 控制方式说明卡片

- **问题**: `#control-mode-info` 永远显示"加载中…"
- **文件**: `public/admin/admin.js`
- **控制台错误**: 无 (静默失败)
- **网络请求**: `GET /api/admin/dashboard` 返回200 OK (请求本身成功)
- **根因**: `loadDashboard()` 第178行使用 `$('dash-control-mode')` 创建/更新新的DOM元素，但HTML第116行使用的是 `id="control-mode-info"`。JS从未更新 `#control-mode-info`。
- **建议修复**: 将 `admin.js` 第178行 `$('dash-control-mode')` 改为 `$('control-mode-info')` 并移除创建新元素的回退逻辑。

### 2. FRONTEND_HANDLER_MISSING - confirmRollback

- **问题**: HTML第246行 `button[onclick="confirmRollback()"]` 引用的函数在admin.js中不存在
- **文件**: `public/admin/admin.js`
- **控制台错误**: `Uncaught ReferenceError: confirmRollback is not defined`
- **网络请求**: 无 (JS错误阻止了请求)
- **根因**: `confirmRollback` 函数从未在admin.js中定义
- **建议修复**: 在admin.js中添加 `function confirmRollback()` 实现

### 3. FRONTEND_HANDLER_MISSING - closeRollbackPreview

- **问题**: HTML第247行 `button[onclick="closeRollbackPreview()"]` 引用的函数在admin.js中不存在
- **文件**: `public/admin/admin.js`
- **控制台错误**: `Uncaught ReferenceError: closeRollbackPreview is not defined`
- **网络请求**: 无 (JS错误阻止了请求)
- **根因**: `closeRollbackPreview` 函数从未在admin.js中定义
- **建议修复**: 在admin.js中添加 `function closeRollbackPreview()` 实现

### 4. BACKEND_ROUTE_MISSING - GET /api/admin/photos/:id

- **问题**: `openEditor()` 在第500行调用 `api('/api/admin/photos/'+id)` 但server.js没有对应路由
- **文件**: `server.js`
- **控制台错误**: 无 (API返回404，catch静默处理或toast)
- **网络请求**: `GET /api/admin/photos/photo-audit-001` → 404
- **根因**: server.js第3560行只匹配精确路径 `/api/admin/photos`，没有个图图片详情路由
- **建议修复**: 在server.js中添加 `parsed.pathname.match(/^\/api\/admin\/photos\/([^/]+)$/)` 路由处理

### 5. BACKEND_ROUTE_MISSING - DELETE /api/admin/photos/:id

- **问题**: `deletePhoto()` 在第481行调用 `api('/api/admin/photos/'+id, {method:'DELETE'})` 但server.js没有对应路由
- **文件**: `server.js`
- **控制台错误**: 无 (API返回404，catch静默处理)
- **网络请求**: `DELETE /api/admin/photos/photo-audit-001` → 404
- **根因**: server.js缺失DELETE方法路由
- **建议修复**: 在server.js中添加 `parsed.pathname.match(/^\/api\/admin\/photos\/([^/]+)$/) && req.method === 'DELETE'` 处理

### 6. BACKEND_ROUTE_MISSING - POST /api/admin/photos/:id/save-edit

- **问题**: `saveEdit()` 在第588行调用 `api('/api/admin/photos/'+EDITOR_STATE.id+'/save-edit', {method:'POST'})` 但server.js没有对应路由
- **文件**: `server.js`
- **控制台错误**: 无 (API返回404，catch静默处理)
- **网络请求**: `POST /api/admin/photos/photo-audit-001/save-edit` → 404
- **根因**: server.js中无 "save-edit" 引用
- **建议修复**: 在server.js中添加 `parsed.pathname === '/api/admin/photos/' + photoId + '/save-edit' && req.method === 'POST'` 路由处理

### 7. EMPTY_SELECTOR - 快捷发布新闻选择器

- **问题**: Dashboard"快捷操作"区域没有新闻选择器(下拉框/列表)来选择要发布的新闻
- **文件**: `public/admin/index.html`
- **控制台错误**: 无
- **网络请求**: 无
- **根因**: HTML第120-130行的快捷操作区域只有一个 `publishNews()` 按钮，没有前置的新闻选择控件
- **建议修复**: 在"立即发布所选新闻"按钮前添加新闻选择器(如多选列表或下拉框)

### 8. EMPTY_SELECTOR - 快捷发布图片选择器

- **问题**: Dashboard"快捷操作"区域没有图片选择器来选择要发布的图片
- **文件**: `public/admin/index.html`
- **控制台错误**: 无
- **网络请求**: 无
- **根因**: HTML第120-130行的快捷操作区域没有图片发布相关控件
- **建议修复**: 在快捷操作区域添加图片选择器+发布按钮

### 9-11. 图片编辑页缺失后端路由(与4-6重复)

图片编辑页(photo-editor-page)的三个操作依赖上述三个缺失的后端路由:
- 打开编辑器时加载图片详情: GET /api/admin/photos/:id
- 保存编辑: POST /api/admin/photos/:id/save-edit
- 删除图片: DELETE /api/admin/photos/:id

---

## 截图证据

测试运行时自动截图保存至: `test/admin/admin-lan-mode-screenshot.png` (在admin-browser-p0-test.js中实现)

## 建议修复优先级

| 优先级 | 问题 | 影响范围 |
|--------|------|----------|
| P0 | `#control-mode-info` 无限加载 | Dashboard用户体验 |
| P0 | `confirmRollback` / `closeRollbackPreview` 缺失 | 发布中心功能完全不可用 |
| P1 | GET/DELETE /api/admin/photos/:id 缺失 | 图片编辑/删除功能不可用 |
| P1 | POST /api/admin/photos/:id/save-edit 缺失 | 图片编辑保存功能不可用 |
| P2 | 快捷操作区缺少选择器 | Dashboard快捷操作不便 |

---

## 文件清单

| 文件 | 路径 |
|------|------|
| 按钮矩阵CSV | `audit/admin-functional-button-matrix.csv` |
| 审计报告 | `audit/admin-functional-findings.md` |
| 浏览器点击测试 | `test/admin/admin-real-browser-click-test.js` |
| 测试夹具: 图片索引 | `test/admin/fixtures_audit/image_index.json` |
| 测试夹具: 新闻缓存 | `test/admin/fixtures_audit/news_cache.json` |
| 测试夹具: 新闻轮换状态 | `test/admin/fixtures_audit/news_rotation_state.json` |
| 测试夹具: 库状态 | `test/admin/fixtures_audit/library_state.json` |
| 测试夹具: last_good_news | `test/admin/fixtures_audit/last_good_news.json` |
