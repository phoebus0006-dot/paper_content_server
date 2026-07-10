# Rendering & EPF1

## Render Pipeline

```
Content (news items / photo path)
  ↓
Layout (compute card positions, text wrapping)
  ↓
SVG Generation (build SVG string with text and shapes)
  ↓
Sharp Render (SVG → raw RGBA raster)
  ↓
Palette Quantization (map RGBA to nearest palette code)
  ↓
EPF1 Encoding (pack two pixels per byte)
  ↓
Frame Validation (verify size, header, palette codes)
  ↓
Frame Cache (in-memory, keyed by frameId)
```

## EPF1 Format

| Offset | Size | Field |
|--------|------|-------|
| 0 | 4 | Magic "EPF1" |
| 4 | 2 | Width (800, uint16 LE) |
| 6 | 2 | Height (480, uint16 LE) |
| 8 | 1 | Panel index (49) |
| 9 | 1 | Frame type (1) |
| 10 | 192000 | Pixel data |

## Palette

| Code | Color | RGB |
|------|-------|-----|
| 0 | Black | #000000 |
| 1 | White | #FFFFFF |
| 2 | Yellow | #FFFF00 |
| 3 | Red | #FF0000 |
| 5 | Blue | #0000FF |
| 6 | Green | #00FF00 |

Code 4 is unsupported. Each byte encodes hi=left, lo=right pixel.

## Quantization

Two modes:
- **clean**: Direct nearest-palette-color mapping (default)
- **fs**: Floyd-Steinberg dithering for smoother gradients

## Frame Validation

Every frame must pass:
- Total bytes = 192010
- Header bytes = 10, magic = "EPF1"
- Width = 800, Height = 480, Panel = 49
- Each payload nibble ∈ {0, 1, 2, 3, 5, 6}
- Code 4 count = 0
