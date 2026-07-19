# 目标内容契约 (Target Content Contract)

## 1. 图片来源与内容限制 (IMAGE_LIBRARY)
### 允许的主题 (IMAGE_ALLOWED_TOPICS)
- 电影镜头 (Film frames, Storyboards)
- 摄影摄像技术示范
- 镜头调度与构图
- 用户自定义的优质参考素材

### 允许的来源 (IMAGE_ALLOWED_SOURCES)
- Wikimedia Category (限定在影视、摄影相关分类)
- Wikimedia Commons 搜索 (限定在明确的影视构图关键词)
- 用户本地导入 (local_import)

### 禁止的主题 (IMAGE_FORBIDDEN_TOPICS)
- NASA 航天图片、宇宙星空
- 普通风景 (Scenery, Nature, Landscape)
- 普通建筑、酒店、城市天际线
- 普通群体肖像
- 任何色情、NSFW 内容

### 禁止的来源 (IMAGE_FORBIDDEN_SOURCES)
- 任何 url_list 中的 NASA 演示数据
- Unsplash random, Picsum, Lorem Picsum 等随机图库
- 未声明、未经验证的 fallback 图库

## 2. 新闻来源与内容限制 (NEWS_PIPELINE)
### 允许的主题 (NEWS_ALLOWED_TOPICS)
- AI 前沿资讯与模型发布 (AI 模型名如 GPT-4, Llama 3)
- 开源项目与 GitHub 仓库动态
- 高质量的垂直领域技术深度新闻

### 允许的来源 (NEWS_ALLOWED_SOURCES)
- Hacker News 等高质量聚合源 (需过滤)
- 专注 AI 与开源的垂直 RSS

### 禁止的主题 (NEWS_FORBIDDEN_TOPICS)
- 无关的综合新闻 (政治、八卦等)
- 泛科技但缺乏技术深度的新闻
- 来源不明、缺乏公信力的内容

### 禁止的来源 (NEWS_FORBIDDEN_SOURCES)
- 示例新闻 (Demo/Example Feeds)
- 随机的 RSS 抓取
- 综合类或无技术深度的外媒 (如法国世界报等非目标领域源)

## 3. 新闻标题与排版规则 (NEWS_FORMATTING_RULES)
- 原始完整标题必须保存在 fullTitle 和 title 字段。
- 严禁错误缩写: 不得把中文标题变成无意义首字母；不得错误截断 AI 模型名；不得错误截断 GitHub 仓库名；不得破坏机构名、连字符、括号或数字版本。
- 最终发布必须使用完整标题数据。
- 必须显示完整的来源名称。

## 4. UI 模块排版规范 (UI_LAYOUT_RULES)
- 标题、来源标签、发布时间、摘要、操作按钮必须位置正确且统一。
- 卡片宽度和间距必须一致，无大面积空白，内容不重叠。
- 选择器必须能显示完整标题。

## 5. 处理流程与隔离 (PIPELINE_AND_ISOLATION)
- 目标来源失败：必须保留旧有效内容，记录错误，不得去抓取普通风景或随机新闻凑数。
