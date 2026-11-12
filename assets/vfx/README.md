# VFX textures

| File | Size | Used by |
| --- | --- | --- |
| `lens-dirt.png` | 512 × 512 RGB, ~73 KB | Advanced VFX lens dirt in the post pass |

The plate is a procedural grayscale dust-and-smudge map on black, modulated by
the bloom highlight so it is only visible near bright sources. It is loaded
lazily with a black 1×1 fallback; a missing file removes only the dust, never
the flare or the rest of the frame.

Regenerate with `/tmp/imgvenv/bin/python` and Pillow if the look needs to be
retuned; the image is deliberately low contrast and tileable-looking.
