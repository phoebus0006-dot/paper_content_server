# 当前实现映射

> 本文件描述“代码现在实际怎么工作”，不是目标架构。必须由执行器根据最新代码扫描填写，并由 reviewer 复核。

## 1. Repository Baseline

```text
branch=master
HEAD=757053264aaa4c892ff31bcf948813f9c3e31c50
origin/master=
server entrypoint=server.js
firmware entrypoint=NewsPhoto_esp32wf/
node major=v24.14.1
package manager=npm
```

## 2. Server Entrypoint

记录：

- server.js LOC；
- top-level functions；
- top-level mutable state；
- process.env 读取位置；
- route registration 位置；
- shutdown hooks。

## 3. HTTP Routes

| Method | Path | Handler Location | Service Called | Writes State | Target/Legacy |
|---|---|---|---|---|---|

必须覆盖：

- device routes；
- news routes；
- frame routes；
- debug routes；
- admin routes；
- health routes。

## 4. Runtime State

| State | In-memory Owner | Persistent File/Store | Write Paths | Read Paths |
|---|---|---|---|---|

至少检查：

- news cache；
- translation cache；
- news rotation；
- last-good；
- image index；
- library state；
- publication history；
- override / operating mode；
- frame cache；
- snapshot cache；
- pin store。

## 5. News Implementation Map

```text
fetch function=fetchText() — IMPLEMENTED
parse function=parseFeedXml() + parseJsonFeed() — IMPLEMENTED
normalize function=normalizeText() — IMPLEMENTED
pre-dedupe=loadNewsCandidates() bigramDice() — IMPLEMENTED
translation provider entry=translateArticle() — IMPLEMENTED
translation cache=runtime.newsCache.translations — IMPLEMENTED
format gate=evaluateNewsItemQuality() — IMPLEMENTED
fidelity verifier=isTextSemanticallyComplete() — PARTIAL (format+fidelity mixed)
display editor=rewriteNewsTitle() + rewriteNewsSummary() — IMPLEMENTED
layout function=layoutNewsCard() — IMPLEMENTED
final dedupe=seenUrls + seenTitles in buildNewsSnapshot — IMPLEMENTED
quality gate=evaluateNewsItemQuality() — PARTIAL
selector=selectStudyPhoto() — PARTIAL (no dual-library source selection)selectStudyPhoto() — IMPLEMENTEDtryAdd() + selectNewsItems() — IMPLEMENTED
last-good=runtime.lastGoodNews + LAST_GOOD_NEWS_FILE — IMPLEMENTED
```

每项必须区分：

- IMPLEMENTED
- PARTIAL
- NOT_IMPLEMENTED

## 6. Image Library Implementation Map

### Learning Library

```text
source adapters=NOT_IMPLEMENTED (Wikimedia integration exists as photo_sources.json)
rights gate=NOT_IMPLEMENTED (rights metadata exists in wikimedia adapter)
safety gate=same BLOCKLIST_WORDS — PARTIALBLOCKLIST_WORDS regex + isImageReady — PARTIAL (no real safety scanner)
relevance gate=NOT_IMPLEMENTED
technical quality gate=NOT_IMPLEMENTED (only decode validation)evaluateNewsItemQuality() — PARTIAL
repository=same image_index.json — PARTIAL (no libraryType field)image_index.json — IMPLEMENTED
selector=selectStudyPhoto() — PARTIAL (no dual-library source selection)selectStudyPhoto() — IMPLEMENTEDtryAdd() + selectNewsItems() — IMPLEMENTED
rotation=updateLibraryStateForPhoto() — IMPLEMENTED
```

### Custom Library

```text
upload endpoint=NOT_IMPLEMENTED (process-images.js is CLI)
decode validation=sharp decode — IMPLEMENTED (CLI only)
safety gate=same BLOCKLIST_WORDS — PARTIALBLOCKLIST_WORDS regex + isImageReady — PARTIAL (no real safety scanner)
repository=same image_index.json — PARTIAL (no libraryType field)image_index.json — IMPLEMENTED
album/tag=NOT_IMPLEMENTED
selector=selectStudyPhoto() — PARTIAL (no dual-library source selection)selectStudyPhoto() — IMPLEMENTEDtryAdd() + selectNewsItems() — IMPLEMENTED
```

## 7. Publication and Operating Modes

记录真实当前实现：

```text
AUTO=schedule resolver resolveDisplayMode() — IMPLEMENTED
ONE_SHOT_OVERRIDE=admin_override + manual publish — IMPLEMENTED (no atomic expiry)
FOCUS_LOCK=NOT_IMPLEMENTED
publication store=admin_override.json + publish_history.json — IMPLEMENTED (direct file write)
active pointer=runtime.cachedFrames + runtime.cachedSnapshots — IMPLEMENTED
rollback=readPubHistory() — PARTIAL (no real snapshot restore)
```

不能根据目标文档填写。

## 8. MQTT

```text
server MQTT publisher=NOT_IMPLEMENTED
topic=NOT_CONFIGURED
publish ordering=NOT_IMPLEMENTED
firmware MQTT client=NOT_IMPLEMENTED
callback behavior=NOT_IMPLEMENTED
reconnect behavior=NOT_IMPLEMENTED
poll fallback=60s HTTP polling in firmware — IMPLEMENTED
```

未实现必须写 NOT_IMPLEMENTED。

## 9. Rendering and Frame

```text
news renderer=renderNewsSvg() + renderNewsFrame() — IMPLEMENTED
photo renderer=renderPhotoFrame() — IMPLEMENTED
analysis renderer=NOT_IMPLEMENTED
comparison renderer=NOT_IMPLEMENTED
sequence renderer=NOT_IMPLEMENTED
quantizer=nearestPaletteCode() + imageToFrameBuffer() — IMPLEMENTED
EPF1 encoder=buildFrameBuffer() — IMPLEMENTED
frame validator=NOT_IMPLEMENTED (no dedicated validator)
```

## 10. Test Map

| Test Script | Production Modules Called | External Mocks | Duplicated Algorithm? | Exit Code Reliable? |
|---|---|---|---|---|

## 11. Data and Deployment

```text
DATA_DIR resolution=
tracked runtime files=
NAS target path=
Docker mode=
bind mounts=
persistent volumes=
```

## 12. Known Gaps

列出目标文档与当前实现之间的差距。

每项格式：

```text
GAP-ID:
Requirement:
Current Implementation:
Risk:
Evidence:
Planned Phase:
```

## 13. Update Rule

每个重构 Phase 合并后更新本文件。

禁止把“目标模块已写在 SYSTEM_ARCHITECTURE.md”当成“当前代码已实现”。
