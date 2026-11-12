# Aqua

A real-time WebGL 2 ocean and ball-physics showcase. It is a static site with no build step; serve this directory from any static web server, for example:

```sh
python3 -m http.server 8000
```

Open `http://localhost:8000` in a WebGL 2 capable browser.

### Development server

The same command is the development server; there is nothing to compile or
watch. Bind it to all interfaces when the page is opened from another device,
a container or a preview proxy:

```sh
python3 -m http.server 8000 --bind 0.0.0.0
```

Then open `http://localhost:8000/`. Edit any file under `js/`, `css/` or
`assets/` and reload the page to see the change. Press **G** for settings, then
open the **Islands** tab and use **Cinematic coast** to see the new land
generation, or choose the **Coral atoll** scene from the Scene tab. For the
night and effects pass, choose the **Moonlit shallows** scene or set
**Settings → System → Advanced VFX** to **Cinematic**.

## Night and advanced VFX

**Settings → System → Advanced VFX** is one master control over every effect:

| Level | What it adds |
| --- | --- |
| Off | The original render path. Every advanced term is skipped. |
| Enhanced | Volumetric sun/moon shafts, lens flare, lens dirt and anamorphic bloom, far depth of field, finer foam and breaker aerosol, denser spray/rain and night fireflies with bioluminescent plankton. |
| Cinematic | The same at full strength, plus a wider two-step bloom pyramid, stronger shafts/flare and a little more grain. |

The night itself was rebuilt: two star layers with colour temperature and
twinkle, a faint galactic band with dust lanes, the occasional shooting star,
a layered moon halo, night airglow, a cool lift to the sky and ambient terms,
a broad moon path on the water and glowing surf foam. Clear nights also bring
seeded fireflies over the islands and cyan plankton motes in the wash, while
the harbour fleet and the ship show warm cabin lamps, blinking mastheads and a
red port light.

Everything is a single number (`uVFX`, 0/1/2) shared by the shaders and the
particle/weather budgets, and low-memory mode forces it off. The lens-dirt
plate is a small local asset (`assets/vfx/lens-dirt.png`); if it cannot load,
the flare simply loses its dust and everything else keeps working. Details and
the performance envelope are in [`docs/vfx-and-night.md`](docs/vfx-and-night.md).

## Balls and capture

Use **Drop ball** or tap the sea, or choose **Ball rain** for a short burst of different balls. **Clear** removes the balls and splash effects and cancels any balls still queued by rain; existing surface ripples fade naturally. A new rain can be started immediately afterwards.

Each ball type has its own material: leather, felt, walnut, cosmic resin, brushed steel and teal latex. The six surfaces are AI-generated photographs packed into one 3×2 texture atlas (`js/materials.js`, sources in [`assets/balls/`](assets/balls/README.md)) and sampled tri-planar, so they keep their grain as the balls tumble. Wetness, highlight sharpness and reflections are applied on top of the sampled material. If the atlas cannot be uploaded, or low-memory mode shrinks it, the balls keep a procedural fallback instead of failing to draw.

Under **Settings → System**, **Screenshot** saves the canvas as a PNG and **Record video** captures the canvas (without the interface or sound). Recording uses a format supported by the browser, normally WebM or MP4. Wait for the current recording to finish saving before starting another one; recording requires browser support for canvas capture and MediaRecorder.

## Sail, swim & explore

Choose **Sail** in the dock (or press **B**) to load the ship and go straight to the helm. It starts at anchor. The chase view follows the actual moving hull; **Deck view** puts you aboard in first person. Drag the scene to look around in either view. You can also select **Explore** (or **U**) to start in the water, swim alongside, and board the open main deck with **E** / **Board**. From the deck, choose **Take helm** or press **B**.

- At the helm, hold **W / ↑** to raise sail and **S / ↓** to ease it; **A / D** or **← / →** steer. The sail-power slider is an alternative to holding a key. **Space** or the anchor button drops or lifts the anchor; raising sail also lifts it. **V** switches between chase and deck views. Heading, speed in knots, sail power and anchor/pilot status are shown on the instruments.
- On touch screens, hold the arrows to adjust sail and steer, use the slider or anchor button, and drag to look. On a phone, a settings button is available in the helm bar. **Leave helm** steps onto the deck without stopping the ship, so you can walk while it keeps its course. From the deck, **E** / **Leave deck** anchors the ship and returns you to the water; **Exit**, **Esc** or **U** anchors it and returns to the original orbit and ball controls.
- Under **Settings → Scene**, **Ship** offers eight classes: Merchantman, Coastal sloop, Brigantine, Caravel, Frigate, Clipper, Dhow and Ghost galleon. Each has its own hull proportions, mast height, sail area, speed, agility, heel and tint, so a sloop accelerates and turns quickly while a galleon carries more way and leans further. Choosing a class re-proportions the same CC0 hull mesh, the deck grid, the chase camera and the balls resting on deck; it does not reload the model. The class is saved with the other settings.
- Sailing is a forgiving, wind-assisted model rather than a full sail simulator: stronger wind changes speed, and a calm eventually leaves the vessel drifting. Sails fill and billow with the apparent wind and ease when you head up, the rigging keeps its silhouette through the motion blur, and the hull heels into gusts and turns. A visible wake grows with speed. The hull samples the sea and turns, heaves, pitches and rolls together with the deck, camera, reflections and resting balls. The ship stops before shallow terrain and at the 180 m sailing-area boundary; turn toward open water to continue. Quakes and the normal pause/slow-motion controls still apply.

### Voyage chart

Open **Chart** at the helm for a north-up overview of the sailing area, the generated island coastlines, your ship and its recent track. **Zoom in** follows the ship for more local detail. Click or tap open water to set a waypoint; the map can also be focused and operated with arrow keys (hold **Shift** for larger steps), **Enter** to set a waypoint and **Esc** to close it. **Start pilot** steers a direct course and slows and anchors near the marker. Manual steering or sail-power input disengages the pilot; a new coast clears the waypoint and stops an active pilot.

The pilot is deliberately simple: **it does not plan a route around islands**. Keep watch and steer manually around land; the hull's shallow-water check stops forward movement if necessary. The chart and track are session-only and reset when the ship is hidden or automatically relocated.

### Swimming and the accessible deck

On desktop, drag to look, use **W/A/S/D** or the arrow keys to move, **Space** to rise and **Shift** to dive. On touch devices, drag to look and hold the movement and **Rise/Dive** buttons. You can swim below the surface and walk onto suitable island shores. Depth is limited to 10 m below the local surface, and exploration is bounded to the surrounding area. Underwater visibility, colour and surface reflection change with depth. Exploration speed, look sensitivity and orbit framing are adjustable under **Settings → Camera**.

The ship's **open main deck** uses collision sampled from the actual mesh. Its enclosed cabins are not modeled as explorable interiors; walls, ropes and other decorative details are not full collision bodies. Boarding places you on the accessible main deck, and walking is limited by the sampled deck and rail boundary. Balls can land on and travel with the deck; if you hide the ship far from home, nearby balls are given time to drift back. The hull is not a full rigid-body collider.

The **Blue-water voyage** and **Storm voyage** scene presets also bring the ship into view. You can switch it on or off in **Settings → Scene** without entering exploration. The ship is Poly Haven's **Dutch Ship Medium**, a CC0 model by James Ray Cock, Nicolò Zubbini and Rico Cilliers. Full source, license, mirror and conversion details are in [`assets/ship/README.md`](assets/ship/README.md); other free 3D sources considered are in [`docs/3d-asset-research.md`](docs/3d-asset-research.md). The approximately 5.4 MB local asset is fetched only when the ship is enabled, and its GPU resources are released when it is hidden. Touch devices upload smaller textures; low-memory graphics mode limits them to 512 px. If an optional ship file fails to load, the ocean remains usable and the ship can be retried.

### Harbour traffic

**Settings → Scene → Harbour traffic** (or **N**, or `Aqua.boats(true)`) puts a working
fleet in the bay: runabouts, a sport boat, a RIB, a day cruiser, a harbour tug, a small
fishing boat, a sailing dinghy, a houseboat, a cargo coaster, a ghost ship and a handful
of mooring buoys. These are real mesh models from Kenney's CC0 *Watercraft Kit*, not
re-proportioned hulls, so each has its own silhouette; provenance, licence and the
conversion are in [`assets/kenney/README.md`](assets/kenney/README.md).

Every craft samples the same Gerstner waves as the water. Four probes on its footprint
give it heave, pitch and roll, and heavier hulls answer the swell more slowly than a
dinghy, so a boat sits *in* the sea instead of on top of it. Powered craft keep a course
inside the bay, ease the throttle in a turn, scan for a clearer bearing when the water
ahead shoals, give the sailing ship room, and are pushed apart rather than through each
other; moored craft swing on their lines. Their wakes feed the shared foam budget, so a
wide fleet can never starve the coast surf.

The fleet is off by default and downloads only when switched on (roughly 400 KB of
models plus one 512×512 shared colour atlas). Its GPU buffers and the atlas are released
when it is switched off, only visible craft are drawn, and craft far from the camera step
their physics at 10 Hz instead of every frame. If a model fails to load, that boat is
simply skipped and the ocean is unaffected.

## Seaquakes & island quakes

Use **Seaquake** or **Island quake** in **Settings → Scene** or **Physics**, or press **Q** / **J**. An island quake needs an existing archipelago. Seaquakes create a spreading, fading wavefront shared by the water renderer and CPU wave sampling. Island quakes create temporary surface fissures, irregular dust and rock chips, small impulses for nearby grounded balls, and optional camera movement. Neither event permanently changes terrain or destroys the ship.

**Settings → Physics** controls quake strength, camera movement and optional occasional automatic quakes, including their average interval. Camera movement defaults to zero when the operating system requests reduced motion. With **Sound** enabled, both events have a low procedural rumble. Quakes pause with the simulation and use bounded, expiring effects.

## Island archipelago

Select **Islands** in the dock (or press **I**) to generate an archipelago; select it again to return to the open ocean. The camera pulls back to frame the islands, and the usual orbit, zoom and ball controls remain available. Balls can land and roll on the terrain. Boulders, plants, rock formations and cascades are decorative and do not create separate collision surfaces.

**Settings → Islands** has controls for:

- **Temperate**, **Tropical**, **Volcanic**, **Alpine**, **Desert**, **Mossland**, **Atoll**, **Fjord** or **Mixed** biomes. Tropical coasts grow palms; volcanic islands have dark basalt and crater-like high ground; alpine slopes hold snow; desert islands have sandstone mesas and cacti; **Mossland** is the most detailed landform, with domain-warped karst ridges, fluted towers, stacked terraces, sinkholes with raised rims and hanging vegetation. **Atoll** builds a continuous ring of coral motu around a real, shallow lagoon; **Fjord** cuts a drowned channel into a steep, snow-shouldered massif without ever splitting the island. Mixed mode assigns five different biomes to the archipelago from the seed and always includes one volcanic island.
- Wild, Coves or Highlands coast types, three to five islands, mountain height, coastline detail, beaches and landform detail.
- Three new layouts: **Scattered** (the original), **Lagoon** (islands in a ring around a sheltered bay) and **Chain** (smaller barrier islands along one bearing), with an **Archipelago spread** control.
- **Cinematic generation**: **Vertical drama** sharpens ridges and lifts the skyline, **Rock terraces** steps the settled surface, **Reef shelf and shallows** widens the turquoise shoal, **Sea stacks** raises offshore pinnacles, and **Coastal mist** adds aerial depth. The **Natural**, **Cinematic**, **Storybook** and **Epic** coast buttons set these together and every slider can then be tuned on its own.
- Tree and cactus density, tree height, grasses, boulders, wildflowers, rock formations, cascades, ferns, reeds, mushrooms, moss cushions and seabirds. Cascades appear on suitable downhill slopes in the wetter biomes.
- Vegetation wind response and cliff-surf intensity.

New installs start with Mixed biomes; settings saved before biomes were added retain their temperate ecology. **New islands** chooses a new seed; **Storm coast** brings in a thunderstorm. The seed and island settings are saved with the other settings, so the same seed and controls recreate the same layout and planting. Terrain and cinematic controls rebuild the current coast, while vegetation and scenery controls update only those detail layers. Pines, palms, plants and grass bend in wind-driven gusts, rain darkens foliage, winter adds snow, and seabirds shelter during heavy storms and at night.

### Water reaching land

The shoreline is now a four-channel field shared by the terrain and the ocean:
height, distance to dry land, and a baked **seaward normal**. The water shader
compares the swell with that normal, so breakers form bands that run shoreward,
bend into coves and wrap around headlands instead of pulsing as a ring around
each island. Flat beaches receive a broad **swash** and a bright waterline lace,
while exposed cliffs throw curling plume sheets, fine spray and a fading foam
wash. The terrain shader draws its own animated foam at the waterline, so the
sea visibly runs up the sand and rock. Sea stacks raise their own surf sources,
so waves break around them too. Storm swells and wind-spindrift still use the
same bounded effect budgets, and the surf slider still silences all of it at
zero.

Cacti, ferns, reeds, moss carpets and cushions use AI-generated skin and foliage textures from [`assets/plants/`](assets/plants/README.md), sampled tri-planar so a plant keeps its detail from any angle. Thirteen new AI-generated, keyed **billboard cutouts** — broadleaf, cypress, eucalyptus, fan palm, banana, tree fern, bamboo, agave, saltbush, dune grass, mangrove, juniper and a dead snag — are packed into one texture array and drawn as a single instanced call, rooted on the sampled terrain. The coastal surface and tree textures in `assets/` are local too; no external texture service is required at runtime. Extra palm, basalt and sandstone textures load only when their biomes are used, and low-memory mode limits their upload size while touch devices use smaller maps. Trees, plants, rocks, grasses, flowers, ferns, reeds, mushrooms, cushions, formations, stacks and birds use seeded instancing to keep their populations bounded. The generation pipeline, shoreline channels and asset tooling are documented in [`docs/land-generation.md`](docs/land-generation.md).

## Rendering controls

**Settings → System** contains render quality, splash detail, motion blur, bloom, edge smoothing and lens-effect controls. Bloom is a quarter-resolution two-stage blur of the bright parts of the scene, so sun glints, foam and lit sails bleed light without a full-resolution cost; it is disabled automatically in low-memory graphics mode. Edge smoothing applies FXAA to the resolved frame, which steadies thin rigging, rails and distant coastlines. Film grain is available with the high-quality preset. Water uses seeded swell phases shared with physics, wind-aligned detail, shoreline foam and shallow-water caustics. Ball materials include wetness-responsive highlights and reflections.

Motion blur uses depth-aware camera reprojection and visible ball and ship motion, with exposure adjusted for frame time. It does not stretch the ball geometry, and history is reset after a resize or a long frame gap. Reduced-motion preferences disable motion blur by default. On slower devices, lower the render quality or splash detail.

Render targets are limited by the device's WebGL dimensions and a pixel budget, especially on high-DPI touch devices. If a framebuffer allocation fails, Aqua releases the partial targets and retries at a smaller resolution. The canvas itself does not allocate redundant depth or multisample buffers: the scene's depth is stored in the offscreen targets used for refraction and motion blur. Unchanged ripple textures and chart coastlines are reused, and conservative ship collision broad phases leave the original detailed checks in place near the shore and deck. Balls that are safely above every possible swell and seaquake skip buoyancy samples that would be exactly zero; the full five-point calculation remains in use near the water.

## Graphics recovery

If the browser loses its WebGL context, rendering pauses and Aqua attempts one automatic restart when the context is restored, or after a short wait if the visible tab is not restored. A shader failure without a driver diagnostic is also retried once. Recovery uses low-memory graphics for that page visit: a smaller resolution budget, half-resolution reflections and smaller island textures. Your saved quality and island settings are not changed; reload normally to use them again. If recovery is not possible, the error screen offers **Retry** and **Retry in low-memory mode**, plus the original graphics diagnostic. Repeated failures never trigger an endless reload or error loop. If WebGL 2 cannot be created at all, update the browser and enable hardware acceleration.

## Tests

Run the Node.js tests for graphics startup and recovery, seeded terrain, the new cinematic generation settings, atoll and fjord landforms, sea stacks, shoreline normals and billboard planting, sailing and waypoint physics, ship and ball collisions, sail transparency, quake/wave synchronization, ripple uploads, bounded effects, and a whole-engine smoke test that boots every module against a stub WebGL 2 context, builds a Mossland island, checks the plant atlas, cycles the ship catalogue and checks points of sail and heel:

```sh
node --test tests/*.test.js
```

For the optional end-to-end WebGL tests, start the static server in another terminal, then use Playwright Core and a WebGL 2-capable Chromium installation (no dependency is needed by the site itself):

```sh
npm install --prefix /tmp/aqua-browser-test --no-save playwright-core
NODE_PATH=/tmp/aqua-browser-test/node_modules CHROMIUM_PATH=/path/to/chromium node tests/webgl-browser.js
NODE_PATH=/tmp/aqua-browser-test/node_modules CHROMIUM_PATH=/path/to/chromium node tests/ship-quake-browser.js
NODE_PATH=/tmp/aqua-browser-test/node_modules CHROMIUM_PATH=/path/to/chromium node tests/voyage-browser.js
NODE_PATH=/tmp/aqua-browser-test/node_modules CHROMIUM_PATH=/path/to/chromium node tests/polish-browser.js
```

Set `AQUA_URL` if the server is not at `http://127.0.0.1:8000/`. On headless machines without a GPU, Chromium may need software-rendering flags, for example `CHROMIUM_FLAGS="--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader"`. The browser tests exercise real shader compilation, desktop sailing, swimming and boarding, chart/pilot behaviour, mobile touch controls and responsive layouts, texture limits, quakes, recording and capture failures, ripple synchronization, optional-asset failure, framebuffer retry, and context-loss recovery; they do not replace visual checks on target devices.
