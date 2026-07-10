# 独立审核指南

## 1. 审核原则

执行器报告不等于事实。

可信证据优先级：

1. Git commit diff；
2. 真实生产代码；
3. 真实测试代码；
4. NAS 运行状态；
5. HTTP 实际响应；
6. ESP32 串口日志；
7. 用户屏幕观察。

## 2. 审核必须检查

### Commit

- 是否真实代码改动；
- 是否空 commit；
- 是否 commit message 与 diff 不一致；
- 是否运行状态污染；
- 是否 secret 泄露。

### Test

- 是否调用真实生产函数；
- 是否复制生产算法；
- 是否 hardcoded PASS；
- 是否只验证 HTTP 200；
- 是否允许 4 条却叫 NEWS_COUNT_6；
- 是否 toy fixture 冒充 production path。

### News

- 是否 6 条；
- 是否去重；
- 是否 placeholder；
- 是否外文未翻译；
- 是否翻译忠实；
- 是否标题 1 行；
- 是否正文 2–3 行。

### Image

- Learning Library 是否真的有学习价值；
- Custom Library 是否独立；
- source selection 是否隔离；
- NSFW 是否 fail-closed；
- unsafe 文件是否真的删除；
- 轮播是否真实变化。

### MQTT

- 是否 publication ready 后才通知；
- callback 是否只设 flag；
- 是否保留 60s polling；
- disconnect 是否不阻塞；
- reconnect 是否 resubscribe。

## 3. Verdict

只使用：

- APPROVE
- REQUEST CHANGES
- BLOCKED

每次只列最关键问题和一个可复制执行提示词。
