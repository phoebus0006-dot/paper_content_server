# 新闻展示与缩写规范契约 (News Display Contract)

## 1. 核心状态
STATUS: NEWS_ABBREVIATION_SPEC_MISSING
(说明：历史记录中未找到精确的展示字数或行数限制，依据规则不得擅自设计机械截断标准。当前布局暂由 CSS 行高和布局可用空间弹性决定，辅以语义提取，避免破坏性截断。)

## 2. 数据隔离与持久化
- 必须明确区分原始字段与展示字段。
- **原始数据 (必须完整保留，严禁覆盖)**: rawTitle, rawContent (兼容原有 title/content 若它们作为原始数据源)。
- **展示数据 (经过语义提炼，可修改)**: displayTitle, displaySummary。
- 缩写过程若失败，必须保留原始数据并标记 abbreviationStatus = failed，禁止显示乱码或截断。

## 3. 标题缩写规则 (Title Semantic Abbreviation)
**TITLE_REQUIRED_INFORMATION (必须保留)**:
1. 新闻主体
2. 核心动作
3. 关键结果
4. 重要项目名
5. 重要模型名 (如 GPT-4o-mini，严禁截断)
6. GitHub 仓库名 (如 paper-content-server，严禁截断)
7. 必要的版本号
8. 影响新闻意义的关键数字

**TITLE_REMOVABLE_INFORMATION (允许删除)**:
1. 重复来源前缀
2. 无意义宣传词
3. 重复标点
4. 与正文重复的修饰语
5. 不影响语义的冗长背景
6. 网站自动添加的尾缀

**禁止行为**:
- 严禁 title.substring(0, n) 或直接从中间截断英文单词。
- 严禁把中文标题转换成无意义首字母。
- 严禁只保留新闻前半句而丢失核心动作。

## 4. 摘要缩写规则 (Summary Semantic Abbreviation)
**SUMMARY_REQUIRED_INFORMATION (必须保留)**:
1. 发生了什么
2. 谁发布或完成
3. 关键功能或变化
4. 为什么值得关注
5. 关键数字、时间或结果
6. 与目标用户相关的价值

**SUMMARY_REMOVABLE_INFORMATION (允许删除)**:
1. 广告语
2. 重复标题
3. 版权尾注
4. RSS 固定模板
5. 导航文字
6. 与核心内容无关的背景
7. 重复来源名称

**禁止行为**:
- 严禁摘要只重复标题或变成只言片语。
- 严禁摘要中包含 HTML 标签。
- 严禁使用未闭合括号或截断英语单词。

## 5. UI 排版与空间利用 (NEWS_CARD_LAYOUT_RULE)
- 卡片文字区域必须占卡片可用宽度的至少 75%。
- 来源标签 (SOURCE_LABEL_RULE) 和发布时间 (TIME_DISPLAY_RULE) 需置于紧凑的元信息行。
- 减少卡片内大面积空白；高度由内容自然撑开。
- 文字字号统一降低一个层级，以容纳更多关键信息。

## 6. 新闻选择器显示 (NEWS_SELECTOR_DISPLAY_RULE)
- option 的文本必须使用 displayTitle，必须能识别完整语义，避免相同前缀无法区分。
- 严禁在选择器中使用带省略号的截断标题。
- option 的 title 属性用于显示 rawTitle 以供悬停查看。
