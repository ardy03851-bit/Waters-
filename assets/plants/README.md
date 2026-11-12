# Plant cutouts and ground textures

Aqua's island ecologies use two kinds of generated plant art:

- four seamless **surface** textures, sampled tri-planar on meshes
  (`cactus-skin.jpg`, `fern-fronds.jpg`, `moss-carpet.jpg`, `reed-blades.jpg`);
- thirteen **billboard cutouts** (RGBA PNG) that grow as instanced plants.

Everything is local, loaded lazily and uploaded in a size suitable for the
device. Nothing is fetched from a network service at run time.

## Billboard cutouts

| File | Species | Aspect (w/h) | Planted in |
| --- | --- | --- | --- |
| `broadleaf-tree.png` | Temperate broadleaf | 0.582 | Temperate, Alpine, Fjord |
| `cypress-tree.png` | Mediterranean cypress | 0.175 | Alpine, Fjord |
| `eucalyptus-tree.png` | Eucalyptus | 0.610 | Temperate, Fjord, Mossland |
| `fan-palm.png` | Fan palm | 0.598 | Tropical, Atoll |
| `banana-plant.png` | Banana | 0.690 | Tropical, Atoll |
| `tree-fern.png` | Tree fern | 1.365 | Tropical, Mossland, Fjord, Temperate |
| `bamboo-cluster.png` | Bamboo clump | 0.479 | Tropical, Mossland |
| `agave.png` | Desert agave | 1.284 | Desert |
| `saltbush.png` | Coastal saltbush | 1.588 | Temperate, Volcanic, Alpine, Atoll, Fjord, Desert |
| `dune-grass.png` | Dune grass tuft | 1.373 | Temperate, Atoll, Volcanic |
| `mangrove.png` | Mangrove with prop roots | 0.676 | Atoll, Tropical |
| `juniper.png` | Windswept juniper | 2.097 | Alpine, Fjord, Temperate, Mossland |
| `dead-snag.png` | Weathered snag | 0.348 | Volcanic, Desert |

Each cutout is a 512 × 512 RGBA PNG whose plant is bottom-anchored with a
small margin, so one instancing shader can root every species on the sampled
terrain. The loader normalises every file into a square canvas before
uploading it and the shader flips V when sampling, so the plant base is always
at the bottom without relying on driver-dependent `UNPACK_FLIP_Y_WEBGL`
behaviour. `plants.json`
records the source pixels, final aspect ratio and file size;
`js/island-scenery.js` carries the same aspect table because the shader needs
it without a network round trip.

All thirteen cutouts are packed into **one WebGL 2 texture array** and drawn
with a single instanced call. The array is 512 px per layer on desktop, 320 px
on coarse-pointer devices and 256 px in low-memory mode. A layer whose PNG
fails to load stays transparent and is simply discarded, so a missing file
never removes the rest of the planting.

## How the cutouts were made

`assets/plants/raw/` holds the generated renders on a flat pure-magenta
background. They are development sources only; the site never requests them.
The committed raw files are capped at 800 px so the repository stays small.

```sh
python3 -m venv /tmp/aqua-assets
/tmp/aqua-assets/bin/pip install pillow numpy
/tmp/aqua-assets/bin/python tools/make-plant-cutouts.py
/tmp/aqua-assets/bin/python tools/make-plant-cutouts.py agave.png   # one file
```

`tools/make-plant-cutouts.py` keys the magenta backdrop, un-blends edge
pixels from the known background colour, removes the pink/magenta cast that
bleeds into translucent leaves, crops to the silhouette, and writes a
512 × 512 bottom-anchored cutout plus `plants.json`. Running it again is
deterministic for the same raw files.

## Provenance and licensing

The plant renders and the four surface textures were generated with an AI
image model specifically for Aqua, then processed by the tool above. They are
included with the project on the same terms as the rest of its own artwork.
No third-party stock photographs, scanned atlases or texture-marketplace
assets are used.

The magenta-background renders are not shown in the app; only the keyed
cutouts and the surface textures are loaded.
