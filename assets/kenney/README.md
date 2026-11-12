# Kenney kits – asset provenance

Aqua's **harbour traffic** and the props used on the islands are built from three of
[Kenney](https://www.kenney.nl/)'s free 3D kits, served locally from this directory.

- **Original assets:** *Watercraft Kit*, *Pirate Kit* and *Nature Kit*, Kenney
  ([kenney.nl](https://www.kenney.nl/)).
- **License:** [CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/).
  Kenney's bundled `LICENSE.txt` permits personal, educational and commercial use
  "for free". Credit is not required; it is given here as a courtesy.
- **Mirror used for the download:** the
  [`shorepine/kenney`](https://github.com/shorepine/kenney) GitHub mirror, fetched through
  the GitHub contents API as `3d/watercraft`, `3d/pirate` and `3d/nature`.

## What is included

| Directory | Files | Content |
| --- | --- | --- |
| `watercraft/` | 15 GLB + `colormap.png` | Runabouts, a sport boat, a RIB, a day cruiser, a harbour tug, a small fishing boat, a sailing dinghy, a houseboat, a cargo coaster, a ghost ship, a large ship, two buoys and an ocean liner. |
| `pirate/` | 19 GLB + `colormap.png` | Dock platforms, a watchtower, barrels, crates, a chest, cannon, masts, palms, rocks and sand patches. |
| `nature/` | 38 GLB | Trees (palm, pine, oak, detailed), rocks and cliffs, a stone column and statue head, a wooden bridge, cacti, water lilies, hanging moss, plants, mushrooms, flowers, logs and stumps. |

Total size is about 2.2 MB. Nothing here is fetched from a CDN at runtime; the files are
served from this site.

## Format and conversion

Every GLB is a single indexed mesh with `POSITION`, `NORMAL` and `TEXCOORD_0` and
(except for the larger hulls) 16-bit indices. `js/kit.js` reads the GLB container
directly, bakes node transforms, and produces one interleaved buffer per model
(position, normal, UV; 32-byte stride, attribute locations 0/1/2). The small craft are
also cached in `localStorage` after the first visit, so a repeat visit does not re-parse
them.

The **Watercraft** and **Pirate** kits share a single 512×512 soft-voronoi colour atlas
(`colormap.png`) and UVs point into it, so one texture covers a whole fleet. The
**Nature** kit has no atlas: each GLB names its materials (`woodBark`, `leafsGreen`,
`dirt`, `grass`, `stone`, …) with a flat base colour instead, which is why the nature
models are tinted per material rather than sampled.

The dark `(204, 204, 204)` base colour factor that the Watercraft/Pirate materials carry
is a placeholder for the atlas sample, not a grey tint; the atlas is decoded in the
fragment shader instead.

## How Aqua uses them

- `js/boats.js` – the harbour fleet: mesh boats that float on the same Gerstner waves as
  the water (four buoyancy probes give heave, pitch and roll), keep a course, avoid
  shoaling water and other hulls, and leave a wake. Off by default; toggle it in
  **Settings → Scene**, with **N**, or `Aqua.boats(true)`.
- `js/island-scenery.js` – the island props are still procedurally generated. The Nature
  and Pirate models in this directory are staged for them; nothing in the island pass
  depends on these files yet.

Each model is loaded only while its feature is enabled, and its GPU buffers and the
shared atlas are released when the feature is switched off. A failed download resolves to
`null` so the ocean keeps working; the fleet simply reports that it could not load.
