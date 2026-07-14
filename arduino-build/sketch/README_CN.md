#line 1 "D:\\dev\\NewsPhoto_esp32wf\\README_CN.md"
# NewsPhoto_esp32wf

这是一个 ESP32-S3 + Waveshare 7.3inch e-Paper HAT(E) 的图片 / 新闻半小时切换工程。

## 硬件

- 屏幕：7.3inch e-Paper HAT(E)
- 连接：橙色 FPC 直接插 HAT，HAT 8pin 直接连 ESP32-S3
- 当前已点亮引脚：BUSY=7, RST=8, DC=9, CS=10, DIN/MOSI=11, SCLK=13
- SPI Select = 0 / 4-line SPI

## ESP32-S3

打开 [NewsPhoto_esp32wf.ino](NewsPhoto_esp32wf.ino) 后修改 [config.h](config.h)：

- `WIFI_SSID`
- `WIFI_PASS`
- `CONTENT_BASE_URL`

串口输出会打印：当前模式、时间、`frameId`、下载大小、显示结果。

ESP32 只请求：

- `/api/state.json`
- `/api/frame.bin`

它会校验 `EPF1` 头、`800x480`、`panelIndex=49`，如果 `state.json` 里的 `frameId` 没变，就跳过刷新。

## 内容服务器

目录是 [paper_content_server](../paper_content_server)。

启动：

```powershell
cd D:\开发板\paper_content_server
npm install
node server.js
```

默认端口：`8787`

接口：

- `GET /`
- `GET /api/state.json`
- `GET /api/frame.bin`
- `GET /api/news.json`

## 图片目录

把图片放在 `D:\开发板\paper_content_server\images`，按主题建文件夹：

- 双人对话
- 人物出场
- 大远景
- 夜景
- 逆光
- 群像
- 悬疑
- 运动镜头
- 色彩搭配
- storyboard

支持 `.jpg`、`.jpeg`、`.png`、`.webp`。

图片模式会尽量连续使用 1-2 个主题，并按 70% 左右电影镜头、30% 左右 storyboard 的比例轮换。

## 时间规则

- 每天 10:00 到 19:00 之间半小时切换
- 整点显示图片
- 半点显示新闻
- 其他时间一直显示图片

`state.json` 会返回：

- `mode`
- `frameId`
- `nextSwitchAt`
- `title`

## 新闻源

新闻源定义在 [paper_content_server/feeds.json](../paper_content_server/feeds.json)。

默认策略：原文高信誉媒体 + 中文翻译，不再使用 BBC 中文、VOA 中文、RFI 中文作为默认主源。

翻译层支持：

- `TRANSLATION_PROVIDER=openai`
- `TRANSLATION_PROVIDER=deepl`
- `TRANSLATION_PROVIDER=none`

API key 从 `.env` 读取，不要提交到仓库。

翻译缓存写入 `data/news_cache.json`。

## 六色映射

- `0` black
- `1` white
- `2` yellow
- `3` red
- `5` blue
- `6` green

图片转帧默认采用最近色量化，`DITHERING=1` 可打开 Floyd-Steinberg 抖动。

## 上传步骤

1. 修改 [config.h](config.h) 里的 WiFi 和服务器地址。
2. 在 Arduino IDE 打开 [NewsPhoto_esp32wf.ino](NewsPhoto_esp32wf.ino)。
3. 选择 ESP32-S3 板卡和串口。
4. 编译并上传。
5. 打开串口监视器，波特率 `115200`。

## 备注

- 不要把真实 WiFi 密码提交到仓库。
- 如果局域网访问失败，优先检查 Windows 防火墙和 `8787` 端口。