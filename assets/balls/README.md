# Ball material atlas sources

The six ball materials in `BALL_MATERIALS` are photographic-style tileable
surfaces generated with an AI image model for this project (no third-party
texture licences involved). Each file is a 1024×1024 JPEG:

| File | Ball type it textures |
| --- | --- |
| `leather-orange.jpg` | Leather |
| `felt-lime.jpg` | Felt |
| `wood-walnut.jpg` | Walnut wood |
| `resin-cosmic.jpg` | Cosmic resin |
| `steel-brushed.jpg` | Brushed steel |
| `latex-teal.jpg` | Teal latex |

`js/materials.js` packs the six images, in that order, into one 3×2 atlas
(three columns, two rows) so the ball renderer samples a single texture and
each ball only needs its atlas tile index. The files are decoded once, drawn
into an offscreen canvas and uploaded with mipmaps; the source images
themselves are never sampled directly at runtime.

Low-memory graphics mode shrinks the atlas to 160 px tiles (a 480×320 upload)
so it fits inside the 512 px texture limit used during recovery. If an image
fails to load, the affected tile keeps a procedural material and the balls
still render.
