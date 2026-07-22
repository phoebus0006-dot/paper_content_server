# NewsPhoto 内容服务

为 NewsPhoto_esp32wf 墨水屏相框提供图片与新闻内容服务。

## 功能

- 每天 10:00-19:00 自动切换：整点显示图片，半点显示新闻。
- 19:00-次日 10:00 保持图片模式。
- ESP32 每 60 秒检测服务状态，只有 `frameId` 变化时才下载并刷新屏幕。
- 图片自动抓取 + 处理流水线，输出适合 7.3 寸六色墨水屏的 800x480 EPF1 帧。
- 新闻保留原有实现（RSS 抓取、翻译、中文简报排版）。

## 快速启动

```bash
cd paper_content_server
copy .env.example .env
npm install
npm run check

# Windows 本地测试时建议显式设置时区
$env:TZ="Europe/Paris"
node server.js
```

服务启动后会打印本地地址，例如：

```
http://192.168.1.100:8787/
http://192.168.1.100:8787/api/state.json
http://192.168.1.100:8787/api/frame.bin
```

## 配置

`.env` 示例：

```env
PORT=8787
TZ=Europe/Paris
TRANSLATION_PROVIDER=none
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o-mini
DEEPL_API_KEY=
DEEPL_API_URL=https://api-free.deepl.com/v2/translate
DITHERING=0

# Admin 访问配置（二选一）：
# 选项 A（推荐局域网）：ADMIN_ACCESS_MODE=lan + 严格 CIDR
# 选项 B（外部访问）：ADMIN_ACCESS_MODE=token + ADMIN_TOKEN=你的密钥
# 安全警告：永远不要使用占位符或默认密钥！
ADMIN_ACCESS_MODE=lan
ADMIN_ALLOWED_CIDRS=127.0.0.0/8,10.0.0.0/8,172.16.0.0/12,192.168.0.0/16
TRUST_PROXY=false
```

- `TZ`：服务时区，决定整点/半点切换点。
- `TRANSLATION_PROVIDER`：`none`、`openai` 或 `deepl`。
- `DITHERING`：`1` 开启抖动，`0` 关闭（默认关闭，避免墨水屏脏点）。
- `ADMIN_ACCESS_MODE`：Admin 面板访问模式。`lan` 为局域网模式（需 CIDR）；`token` 为 Bearer Token 模式（需设置 `ADMIN_TOKEN`）。
- `ADMIN_ALLOWED_CIDRS`：LAN 模式下允许访问的 CIDR 白名单（逗号分隔）。
- `ADMIN_TOKEN`：Token 模式下 Bearer Token 值。内容自定义，建议用 UUID/复杂随机字符串。

图片来源在 `config/photo_sources.json` 中配置。默认启用：

- `wikimedia_commons`
- `internet_archive`
- `local_import`

禁用或按需要启用 `europeana`、`rss_images`、`url_list`。

## 抓取图片

```bash
# 从所有启用来源抓取
node scripts/fetch-images.js

# 只抓 5 张测试
node scripts/fetch-images.js --limit 5

# 只抓指定来源
node scripts/fetch-images.js --source wikimedia_commons --limit 5
```

抓取结果：

- 原图保存到 `data/raw_images/`
- 索引写入 `data/raw_index.json`

## 处理图片

```bash
# 处理所有未处理原图
node scripts/process-images.js

# 只处理 5 张
node scripts/process-images.js --limit 5
```

处理结果：

- 800x480 处理后预览图保存到 `data/processed_images/{id}.png`
- EPF1 payload 保存到 `data/processed_images/{id}.epf`
- 索引写入 `data/image_index.json`

处理流程：

1. 按 EXIF 自动旋转
2. 中心裁切到 5:3 并 resize 到 800x480
3. 亮度提升 5%
4. 轻微锐化
5. 六色量化（0 黑、1 白、2 黄、3 红、5 蓝、6 绿）
6. EPF1 打包

## 手动导入图片（旧版兼容）

把图片放进 `data/import_images/`（或 `data/import_images/shots/<theme>/`），然后运行：

```bash
node scripts/fetch-images.js --source local_import
node scripts/process-images.js
```

新版推荐直接用 `import-images.js` 导入到 `images/` 目录。

## 调试接口

浏览器打开：

- `http://127.0.0.1:8787/` — 服务首页
- `http://127.0.0.1:8787/api/state.json` — 当前状态
- `http://127.0.0.1:8787/api/frame.bin` — 当前帧二进制
- `http://127.0.0.1:8787/api/library.json` — 图片库列表
- `http://127.0.0.1:8787/debug/photo.png` — 当前图片预览
- `http://127.0.0.1:8787/debug/photo-info.json` — 当前图片元数据
- `http://127.0.0.1:8787/debug/news.png` — 当前新闻预览

## Docker 构建

项目支持两种构建模式：

### 开发构建（docker compose，本地快速启动）

```bash
cd paper_content_server
docker compose up -d --build
docker compose logs --tail=100
```

构建时自动传 `BUILD_MODE=development`，不要求真实 git SHA。manifest 中 `dirty=true` 且 `buildMode=development`。`container-selftest` 允许 dirty。

### 正式发布构建（NAS 部署，严格验证）

```bash
# 由 deploy/nas/build-staging.sh 调用，传真实 SHA/TREE
docker build --no-cache \
  --build-arg BUILD_GIT_SHA=$(git rev-parse HEAD) \
  --build-arg BUILD_GIT_TREE=$(git rev-parse HEAD^{tree}) \
  --build-arg BUILD_DIRTY=false \
  -t paper-content-server:$(git rev-parse --short=12 HEAD) .
```

正式构建拒绝 unknown/dirty。production stage 的 `docker inspect` 可查到 `BUILD_GIT_SHA`、`BUILD_GIT_TREE`、`BUILD_DIRTY`。

检查：

```bash
curl -I http://127.0.0.1:8787/api/frame.bin
curl http://127.0.0.1:8787/api/state.json
```

`docker-compose.yml` 使用 `network_mode: host`，并持久化 `data/` 目录，避免容器重建后图片库丢失。

## 在容器内抓图/处理

```bash
docker compose exec paper-frame-server node scripts/fetch-images.js --limit 5
docker compose exec paper-frame-server node scripts/process-images.js --limit 5
```

## 图片来源与导入

### 素材库目录结构

建议按以下目录组织图片：

```
images/
  shots/               # 电影镜头/摄影作品（占 70%）
    双人对话/
    人物出场/
    大远景/
    夜景/
    逆光/
    群像/
    悬疑/
    运动镜头/
    色彩搭配/
  storyboard/          # 原始分镜稿（占 30%）
    双人对话/
    人物出场/
    大远景/
    夜景/
    逆光/
    群像/
    悬疑/
    运动镜头/
    色彩搭配/
```

轮播顺序：shot → shot → storyboard → shot → shot → storyboard。

### 合法来源与版权说明

> **不要自动批量爬取 ShotDeck、FilmGrab、电影截图、设定集、幕后画册的脚本。**
> **不要绕过登录、付费墙、反爬或版权限制。**

建议图片来源：

- **电影镜头/摄影截图（shot，约占 70%）：**
  - [Wikimedia Commons](https://commons.wikimedia.org/) — CC 协议，可直接用 `node scripts/fetch-images.js` 抓取
  - [Picsum Photos](https://picsum.photos/) — 免费占位图，已在 `url_list` 中预配置
  - [Internet Archive](https://archive.org/) — 公共领域/CC 图片
  - ShotDeck：手动下载自己有权使用的图片后导入
  - FilmGrab：手动保存公开页面允许范围内的图片
  - 自己从喜欢的电影、剧集、MV 中截帧（仅限个人使用）

- **真实分镜稿（storyboard，约占 30%）：**
  - [StudioBinder](https://www.studiobinder.com/) 公开示例
  - DGA 相关公开资料
  - Animation Resources
  - 电影设定集、幕后画册、导演/美术公开资料

- **建议命名：**
  ```
  电影名_年份_主题_序号.jpg
  BladeRunner2049_2017_夜景_001.jpg
  ```

- **建议比例：** 70% 电影镜头截图 + 30% 原始分镜稿

### 导入脚本

```bash
# 从本地目录导入电影截图到 shots/夜景
node scripts/import-images.js --from "./素材/电影截图" --kind shot --theme 夜景

# 从本地目录导入分镜稿到 storyboard/双人对话
node scripts/import-images.js --from "./素材/分镜" --kind storyboard --theme 双人对话

# 只预览不复制
node scripts/import-images.js --from "./素材" --dry-run

# 查看帮助
node scripts/import-images.js --help
```

导入脚本只复制文件，不联网下载。已存在的同名同大小文件自动跳过。

### 自动抓取（开放 API）

支持从以下开放来源自动抓取（在 `config/photo_sources.json` 中配置）：

- Wikimedia Commons（CC 协议，默认启用）
- Internet Archive（公共领域，默认启用）
- Picsum（免费占位图，默认启用）

```bash
# 从所有来源抓取
node scripts/fetch-images.js --limit 10

# 处理为墨水屏格式
node scripts/process-images.js
```

### 不使用盗版或受限资源

本项目**不会**自动爬取需要登录、付费或明确禁止抓取的网站，
例如 ShotDeck、FilmGrab 等通常需要订阅的站点的批量爬取。
请手动下载你有权使用的图片，然后通过 `import-images.js` 导入。

## ESP32 说明

`NewsPhoto_esp32wf/config.h`：

```cpp
#define REFRESH_INTERVAL_MS 60000UL
```

ESP32 每 60 秒请求 `/api/state.json`：

- `frameId` 未变：只打印简短日志，不下载、不刷新屏幕。
- `frameId` 变化：下载 `/api/frame.bin`，校验 `EPF1` header，然后刷新墨水屏。

## 目录结构

```
paper_content_server/
  config/photo_sources.json   # 图片来源配置
  scripts/
    fetch-images.js           # 图片抓取
    process-images.js         # 图片处理
    import-images.js          # 本地素材导入
  images/
    shots/                    # 电影镜头/摄影作品
      <theme>/                # 按主题分类
    storyboard/               # 原始分镜稿
      <theme>/
  data/
    raw_images/               # 下载原图
    processed_images/         # 800x480 PNG + EPF
    import_images/            # 手动导入（旧版）
    image_index.json          # 处理后的图片索引
    raw_index.json            # 原图索引
    library_state.json        # 轮播状态
    news_cache.json           # 翻译缓存
    news_rotation_state.json  # 新闻去重状态
```

## 验收检查

```bash
npm run check
node scripts/fetch-images.js --limit 5
node scripts/process-images.js --limit 5
node server.js
```

然后访问：

```
http://127.0.0.1:8787/api/state.json
http://127.0.0.1:8787/api/frame.bin
http://127.0.0.1:8787/debug/photo.png
http://127.0.0.1:8787/api/library.json
```

## 时间调度自测

```bash
node scripts/test-schedule.js
```

验证 10:00-19:00 的整点/半点切换、夜间保持图片、次日切换点是否正确。

`/api/frame.bin` 应为 192010 字节，header：

- magic `EPF1`
- width 800
- height 480
- panelIndex 49
- payload 192000
