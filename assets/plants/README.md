# Plant texture sources

These four 1024×1024 JPEGs were generated with an AI image model for Aqua and
are used as tri-planar foliage and skin textures by `js/island-scenery.js`:

| File | Used for |
| --- | --- |
| `cactus-skin.jpg` | Ribbed cactus skin (cactus and columnar forms) |
| `moss-carpet.jpg` | Mossland shelves, boulder caps and cushions |
| `fern-fronds.jpg` | Fern blades and hanging fronds |
| `reed-blades.jpg` | Reed and grass blade clusters |

All four load lazily, only for the biomes that plant them: `cactus-skin.jpg`
for desert and mixed archipelagos, the other three for Mossland and mixed
archipelagos. Low-memory mode caps their upload at 512 px, and a touch device
that is not in safe mode caps them at 640 px. If a file fails to load, the shader binds an
already-loaded biome texture (or the flat fallback colour) so nothing
disappears and no draw call is skipped.
