# 独立审查协议

## 1. Git 审查

必须获取：

```text
branch
HEAD
origin/master
git status
latest commits
diff stat
actual diff
```

要求：

- HEAD 与 remote 一致；
- 非空 commit；
- 无 force/amend/rebase 历史改写；
- 无 secret；
- 无 runtime state 污染。

## 2. 代码审查

按领域检查：

### Schedule
是否仍使用正式 resolver。

### Snapshot
state/frame 是否同一 snapshot。

### News
抓取、翻译、去重、last-good、layout 是否分层且真实接入。

### Library
Learning 与 Custom 是否独立。

### Safety
删除是否覆盖文件、索引、cache、snapshot、active、rollback。

### MQTT
activate before notify；callback 只设 flag；poll fallback 保留。

### Admin
route 是否只做 auth/validate/service mapping，禁止旁路写状态。

## 3. 测试审查

搜索并人工检查：

```text
test(..., true)
ok(true)
every(() => true)
return true
```

同时检查：

- 是否测试复制生产算法；
- 是否 fixture 直接预过滤；
- 是否 non-200 也算 PASS；
- timeout/error 是否吞掉；
- 是否命名比真实断言更强；
- 是否生产模块真正被调用。

## 4. 生产验证

至少：

- `/api/state.json`
- `/api/news.json`
- `/api/frame.bin`
- health
- MQTT smoke

检查：

- news 6 unique；
- placeholder=0；
- untranslated foreign=0；
- frame=192010；
- code4=0；
- state.frameId == X-Frame-Id。

## 5. ESP32

没有真实串口日志和屏幕观察：

```text
ESP32_RUNTIME_STATUS=NOT TESTED
```

不得推断 PASS。

## 6. 审查输出模板

```text
VERDICT: APPROVE | REQUEST CHANGES | BLOCKED

CRITICAL ISSUES:
1.
2.
3.

SAID-BUT-NOT-DONE:
-

EVIDENCE GAPS:
-

COPYABLE EXECUTOR INSTRUCTION:
...
```
