# 渲染与 EPF1

## 1. 单一生产链路

所有内容都必须走：

```text
Content Model
→ Renderer
→ RGB Raster
→ Quantizer
→ Palette Codes
→ EPF1 Encoder
→ Frame Validator
```

适用于：

- schedule；
- ONE_SHOT；
- FOCUS_LOCK；
- Admin preview；
- rollback。

## 2. 新闻

- 6 cards；
- title 1 行；
- summary 2–3 行；
- overflow=false；
- 使用真实 CJK 字体。

## 3. 图片

支持：

- single；
- analysis card；
- comparison pair；
- 2×2 sequence。

## 4. EPF1

- header=10；
- payload=192000；
- total=192010；
- high nibble=left；
- low nibble=right。

## 5. Palette

允许：

0,1,2,3,5,6

禁止：

4

FrameValidator 必须逐 nibble 扫描。
