# 新闻流水线

## 1. 目标

输出 6 条高质量、独立、可读的新闻。

## 2. Pipeline

```text
Fetch
→ Parse
→ Normalize
→ Canonicalize
→ Pre-Dedup
→ Faithful Translation
→ Fidelity Verification
→ Chinese Editing
→ Layout Fit
→ Final Dedup
→ Quality Gate
→ Select 6
→ Last-Good
```

## 3. Pre-Dedup

至少：

- canonical URL；
- GUID/article identity；
- normalized original title；
- title similarity。

## 4. Translation

### Stage A：Faithful Translation

不做电子纸短文本压缩。

### Stage B：Fidelity Verification

检查：

- subject；
- action；
- negation；
- numbers；
- currency；
- percentage；
- time；
- location；
- person；
- organization；
- unsupportedClaims；
- missingFacts。

### Stage C：Chinese Editing

把忠实译文编辑成适合电子纸的自然中文。

禁止：

- 机械 slice；
- 改变事实；
- 为凑长度编造内容。

## 5. Final Dedup

至少：

- canonical URL；
- article identity；
- normalized original title；
- normalized final Chinese title；
- final title similarity。

source quota 只能在 dedupe 后执行。

## 6. Selection

硬条件：

```text
FINAL_COUNT=6
UNIQUE_CANONICAL_URL_COUNT=6
UNIQUE_ARTICLE_ID_COUNT=6
UNIQUE_FINAL_TITLE_COUNT=6
DUPLICATE_ARTICLE_COUNT=0
PLACEHOLDER_COUNT=0
FOREIGN_UNTRANSLATED_COUNT=0
```

## 7. Layout

唯一共享：

```text
layoutNewsCard()
```

生产、测试、Admin preview 共用。

要求：

- titleLines=1；
- summaryLines=2 或 3；
- overflow=false。

## 8. Last-Good

只有完整合格 6 条可覆盖。

live fail / invalid / duplicate / insufficient：
使用 last-good，不覆盖它。
