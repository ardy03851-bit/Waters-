# Land generation

Aqua builds every island from a seeded, single-valued heightfield and then
shares that exact surface with collision, the shoreline field, the surf line,
the voyage chart and the planting. Nothing visible is painted on afterwards.

This document describes the generation pipeline, the cinematic controls, the
shoreline field and the plant system added in the land-generation update.

## Pipeline

1. **Layout** (`generateIslands`) places 3–5 island centres, rotates and
   reflects the layout from the seed, then pushes neighbours apart until every
   pair keeps an open channel of at least
   `1.36 × (rA + rB) + 1.5 m`.
2. **Heightfield** (`islandProfile`) builds the shelf, coastal escarpment,
   headlands, coves, peaks, erosion detail and the biome landform. The result
   is clamped smoothly into the shoreline map's 28 m range.
3. **Mesh** (`makeIslandMesh`) samples that profile on a regular grid and
   derives normals from the samples, so the drawn surface and the collision
   surface are the same numbers.
4. **Shoreline field** (`makeIslandMap`) rasterises height, distance to land
   and a seaward normal into a 512 × 512 RGBA8 texture.
5. **Details and planting** run on independent seeded streams: pines, rocks,
   grass, birds, sea stacks, the geometry-based scenery (cactus, fern, reeds,
   mushrooms, cushions, blossoms, spires, palms) and the billboard cutouts.
6. **Surf sources** (`makeIslandCoast`) sample the real waterline, classify
   each point as cliff or beach, and derive a seaward normal from the surface
   gradient.

Terrain-only controls rebuild all of the above. Planting controls rebuild only
their own layer, so moving a grass slider never reshuffles boulders or cuts
the surf.

## Biomes

| Biome | Landform | Ecology |
| --- | --- | --- |
| Temperate | Rolling cliffs, two coves | Pines, broadleaf, eucalyptus, ferns, grasses |
| Tropical | Rippled peaks and sheltered water | Fan palms, banana, tree ferns, bamboo |
| Volcanic | Cone, crater rim and bowl | Basalt, ash, saltbush, dead snags |
| Alpine | Serrated ridge and snow line | Pines, cypress, juniper, tree ferns |
| Desert | Wind-cut mesas and strata | Agave, saltbush, sandstone, cacti |
| Mossland | Karst towers, terraces, sinkholes | Dense ferns, reeds, moss cushions, luminous mushrooms |
| **Atoll** | Continuous ring of coral motu around a real lagoon | Fan palms, mangroves, dune grass |
| **Fjord** | Drowned channel cutting into a steep massif | Wet black rock, cypress, broadleaf, juniper, snow shoulders |

`Mixed` archives five different biomes from the seed and always includes one
volcanic island.

The atoll and fjord landforms are generated inside the normal coastal
envelope. The atoll's ring is smooth enough that noise can only dent it, so it
is always one connected shore with a lagoon below sea level in the middle. The
fjord channel enters from the western shore and dead-ends before the summit,
so the island is never split in two. Both are covered by tests that rasterise
the land and count connected components.

## Generation settings

| Setting | Default | Effect |
| --- | --- | --- |
| Layout | Scattered | Scattered, Lagoon (ring around a sheltered bay) or Chain (barrier chain) |
| Archipelago spread | 1.0× | Scales the layout about the chart centre |
| Vertical drama | 0 | Sharpens ridged detail, steepens cliffs, lifts the skyline |
| Rock terraces | 0 | Steps the settled surface into benches (Mossland keeps its own stronger default) |
| Reef shelf and shallows | 1.0× | Widens the shallow shelf, which feeds the turquoise shoal and breakers |
| Sea stacks | 0.25× | Offshore pinnacles on the shallow shelf |
| Coastal mist | 0.12× | Low aerial veil on land and water |
| Relief, coast, beaches, landform | 1× | Pre-existing terrain controls |

The Islands tab also has four one-tap presets that write these settings
individually, so the user can keep tuning afterwards:

- **Natural** — the original coast.
- **Cinematic** — drama 1.05, terraces 0.45, wide shelf, sea stacks, mist.
- **Storybook** — gentler relief, strong terracing, wide beaches, soft mist.
- **Epic** — maximum drama, tight shelf, many stacks, little mist.

`Aqua.coast()` lists the presets and `Aqua.coast('cinematic')` applies one.
Three one-tap scenes (Coral atoll, Fjord dawn, Cinematic coast) enable islands
with a preset and matching weather.

## Shoreline field and breaking water

The island map is now **RGBA8**:

| Channel | Content |
| --- | --- |
| R | Terrain height, −12 … 28 m |
| G | Distance to dry land, 0 … 12 m |
| B, A | Seaward shoreline normal, encoded 0 … 1 |

The normal is the smoothed gradient of the distance transform. The water
shader uses it to compare the swell direction with the coast:

- **Breakers** are bands of white water whose phase follows distance to land
  and time. They bend into coves, wrap around headlands and weaken in the lee.
- **Swash** is the broad wash at the waterline. On flat beaches it is wider
  and longer-lived.
- **Shoaling colour** brightens the shallow shelf to reef turquoise.
- The stored normal points **seaward**, so the windward shore receives the
  steepest breakers and the lee shore stays calmer for the same sea state.
- **Waterline foam** is also drawn on the terrain shader, so the sea visibly
  reaches sand and rock instead of stopping at a hard intersection.

`updateIslandSurf` watches real wave-crest crossings at sampled coast points.
Steep points throw cliff plumes through the existing surf-sheet system; gentle
points receive running wash through `spawnShoreWash`, which feeds the coast
foam mesh. The wash quad runs **landward** and samples the same height field in
its vertex shader, so it climbs the sand with the beach rather than hovering at
sea level. A separate continuous swash timer guarantees that visible shoreline
keeps receiving white water even when no plume budget is free. Every sea stack
is registered as a surf source (and refreshed in place when the stack slider
changes), so waves break around the rocks as well as the coast.

All of this remains decorative: terrain is still the only collider, the surf
setting still suppresses it at zero, and the paused simulation creates nothing.

## Plants

Thirteen AI-generated, keyed billboard species are packed into a single WebGL 2
texture array and drawn as one instanced call. The species table (height range,
wind flexibility, aspect, biome recipe) lives in `js/island-scenery.js`; the
assets and the regeneration tool are documented in
[`assets/plants/README.md`](../assets/plants/README.md).

Every plant is rooted on the sampled terrain (`y = ground − 0.05 m`), never
shuffles when another slider moves, and stays inside a bounded budget. Small
chain islets pack their foliage a little tighter so a barrier chain still reads
as wooded rather than as bare rock. Plants are decorative, like boulders and
cascades.

## Performance notes

- The plant array is 512 px/layer on desktop, 320 on coarse pointers and 256 in
  low-memory mode; 13 layers cost about 13.6 MB, 5.3 MB and 3.4 MB of texture
  memory respectively.
- The sea-stack and plant counts scale with island area and the relevant
  sliders and are capped by tests.
- The shoreline normal is computed once per coast regeneration, not per frame.
- Mist is a shader term; it adds no geometry, textures or draw calls.
- The surf and foam systems remain bounded (48 sheets, 24 coast foam quads,
  28 wind streaks).

## Tests

`node --test tests/*.test.js` covers:

- seeded reproducibility, channel separation, collidable terrain and shore
  normals;
- the new drama, terrace, shelf, stack, mist and layout settings, including
  extreme values;
- atoll rings and fjord channels as connected, collidable landforms;
- sea-stack placement on the sampled seabed, their surf entries and a
  duplicate-free refresh when the stack slider changes;
- every layout staying inside the shoreline map, including a maximal chain
  spread;
- billboard plants rooted in the collision heightfield and independent of
  other layers;
- the whole-engine stub boot, including the plant atlas and Mossland scenery.
