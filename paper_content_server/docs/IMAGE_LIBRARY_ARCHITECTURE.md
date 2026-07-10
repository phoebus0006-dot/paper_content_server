# 图片双图库架构

## 1. 总体结构

```text
Image System
├── Learning Library
│   ├── 自动定向抓取
│   ├── 权利信息检查
│   ├── NSFW 安全门
│   ├── 学习相关性门
│   ├── 技术质量门
│   └── 学习轮播
└── Custom Library
    ├── 用户上传
    ├── NSFW 安全门
    ├── 元数据管理
    ├── 相册/标签
    └── 用户显式选择
```

## 2. Learning Library

目标是自动获取：

- 优秀电影静帧；
- 原始 storyboard；
- film frame sequence；
- storyboard sequence；
- comparison pair；
- 具有构图、调度、光线、色彩、连续性学习价值的素材。

禁止把普通：

- NASA；
- 风景；
- 建筑；
- 酒店；
- 城市天际线；
- 普通群体肖像；

当作学习内容。

## 3. 自动抓取 Pipeline

```text
Source Adapter
→ Candidate Discovery
→ Metadata Validation
→ Rights Validation
→ Temporary Download
→ Decode Validation
→ Strict Safety Gate
→ Relevance Gate
→ Technical Quality
→ Normalize Metadata
→ Learning Repository
→ Rotation
```

## 4. Learning Source Policy

允许：

- storyboard category；
- film still category；
- film frame category；
- public domain film source；
- curated sequence source；
- approved manual seed。

要求：

- 每个配置 source 必须真实存在；
- candidate count 可观测；
- license metadata 可验证；
- rights unknown 不自动进入 production。

## 5. Custom Library

用户可上传：

- 电影镜头；
- 分镜稿；
- 参考图片；
- 用户自有素材。

流程：

```text
Upload
→ Decode
→ Safety Gate
→ Safe Asset
→ Metadata Edit
→ Album/Tag
→ Available for Explicit Display
```

## 6. Source Selection

手动或 FOCUS_LOCK 必须显式：

- learning
- custom

禁止 silent cross-library fallback。

## 7. Display Modes

### SINGLE

单图。

### ANALYSIS_CARD

画面 + 精简分析字段。

### COMPARISON_PAIR

Storyboard vs Final Shot。

### SEQUENCE_2X2

sequenceId 相同，sequenceIndex=1,2,3,4。

## 8. Learning Rotation

考虑：

- theme coverage；
- recent history；
- shown count；
- sequence integrity；
- study set integrity；
- learning value score。

不是纯随机。
