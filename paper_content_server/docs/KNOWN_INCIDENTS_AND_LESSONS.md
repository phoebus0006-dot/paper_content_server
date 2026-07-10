# 已知事故与审查教训

本文件记录项目已经出现过的失败模式，避免后续审查再次犯同样错误。

## 1. 色情图片进入电子纸轮播

教训：

- source 配置存在 blocklist 不代表执行路径真的使用；
- technical quality 不是 content safety；
- 仓库索引安全不代表 NAS runtime、旧 cache、旧 publication 安全；
- 审核必须覆盖 candidate → download → safety → index → selector → snapshot → frame → rollback 全链路。

## 2. 安全门修复后图片完全不轮播

教训：

- safety PASS 不等于功能可用；
- 必须同时验证 selectable pool 非空；
- fallback 必须真实多图轮播；
- 需要真实生产 HTTP 路径多 slot 测试。

## 3. 新闻显示“暂无新闻”或 6 条 placeholder

教训：

- NEWS_COUNT=6 不是成功标准；
- placeholder 不能冒充新闻；
- 必须验证 live、last-good 和 cold-start 三条路径；
- last-good 只有完整有效 6 条才能覆盖。

## 4. 重复新闻进入 6 格

教训：

- source quota 不能绕过去重；
- 必须有 pre-dedup 和 final-dedup；
- canonical URL、article identity、原文标题、最终中文标题均需检查。

## 5. 翻译测试全绿但译文仍错

教训：

- 有中文字符不等于翻译正确；
- 句号、长度、悬空词只是 format gate；
- 必须比较主体、动作、否定、数字、实体和 unsupported claims。

## 6. 新闻三行测试是假验证

教训：

- 测试脚本复制 wrapText 不等于生产 renderer；
- toy SVG 有黑色像素不等于真实新闻卡片可读；
- layout 必须生产和测试共享同一个函数。

## 7. “跨边界”“TTL”“重启”等测试曾出现名实不符

教训：

- 测试名不是证据；
- 必须检查时间点、输入数据和断言；
- 29s HIT 与 31s MISS 都要真实测；
- 重启必须同 data dir、真实进程退出、避免 stale server。

## 8. Admin 曾出现假成功

教训：

- 写 override/history 和生成字符串 frameId 不等于发布；
- manual publish 必须走真实 renderer → quantizer → EPF1 → snapshot → state/frame；
- unknown ID 不得返回 200；
- rollback 必须恢复真实 snapshot。

## 9. 执行器曾创建空 commit 或提交标题与 diff 不一致

教训：

- 每次必须看实际 diff；
- `git diff --cached --stat` 无内容禁止 commit；
- 不能相信 commit message。

## 10. NAS 连接状态曾被无证据推断

教训：

- timeout、refused、auth fail、DNS fail、route fail 必须区分；
- 复用已有 SSH 配置；
- 不向用户索取私钥；
- Git push 成功不等于 NAS 已部署。

## 11. 空提交和 Commit Message 与 Diff 不一致

教训：

- b49d262 是 0 files changed 的空提交，但 commit message 声称"reconcile acceptance and traceability"；
- 实际内容已在 f1db1d6 中完成；
- 审查必须检查 `git diff HEAD^ --stat` 确认每个 commit 有真实 diff；
- 禁止在有 staged diff 时创建 empty commit。
