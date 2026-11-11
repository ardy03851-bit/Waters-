# Aqua

A real-time WebGL 2 ocean and ball-physics showcase. It is a static site with no build step; serve this directory from any static web server, for example:

```sh
python3 -m http.server 8000
```

Open `http://localhost:8000` in a WebGL 2 capable browser.

## Swim & explore the ship

Select **Explore** in the dock (or press **U**) to bring in a floating sailing ship and enter first-person swimming. The ship loads locally on demand, follows the swells with gentle heave and roll, and casts a reflection; wind moves its sails and rougher water creates small patches of contact foam. The **Blue-water voyage** and **Storm voyage** scene presets also bring the ship into view. You can switch the ship on or off in **Settings → Scene** without entering exploration.

- On desktop, drag the scene to look, use **W/A/S/D** or the arrow keys to move, **Space** to rise and **Shift** to dive. Swim alongside and surface, then press **E** or select **Board**. **E** / **Leave deck** returns you to the water; **Esc**, **U** or **Exit** returns to the original orbit and ball controls.
- On a touch device, drag the scene to look and hold the movement and **Rise/Dive** buttons. **Board** and **Exit** are in the exploration bar. Speed and look sensitivity are adjustable under **Settings → Camera**, which also has **Frame ship** and **Frame islands** buttons for the orbit view.
- You can swim below the surface and walk onto suitable island shores. Depth is limited to 10 m below the local surface, and exploration is bounded to the surrounding area. Underwater visibility, colour and surface reflection change with depth.
- The ship's **open main deck** uses collision sampled from the actual mesh. Its enclosed cabins are not modeled as explorable interiors; walls, ropes and other decorative details are not full collision bodies. Boarding places you on the accessible main deck, and walking is limited by the sampled deck and rail boundary. Balls can land on the deck, but the hull is not a full rigid-body collider.

The ship is Poly Haven's **Dutch Ship Medium**, a CC0 model by James Ray Cock, Nicolò Zubbini and Rico Cilliers. Full source, license, mirror and conversion details are in [`assets/ship/README.md`](assets/ship/README.md); other free 3D sources considered are in [`docs/3d-asset-research.md`](docs/3d-asset-research.md). The approximately 5.4 MB local asset is fetched only when the ship is enabled, and its GPU resources are released when it is hidden. Touch devices upload smaller textures; low-memory graphics mode limits them to 512 px. If an optional ship file fails to load, the ocean remains usable and the ship can be retried.

## Seaquakes & island quakes

Use **Seaquake** or **Island quake** in **Settings → Scene** or **Physics**, or press **Q** / **J**. An island quake needs an existing archipelago. Seaquakes create a spreading, fading wavefront shared by the water renderer and CPU wave sampling. Island quakes create temporary surface fissures, irregular dust and rock chips, small impulses for nearby grounded balls, and optional camera movement. Neither event permanently changes terrain or destroys the ship.

**Settings → Physics** controls quake strength, camera movement and optional occasional automatic quakes, including their average interval. Camera movement defaults to zero when the operating system requests reduced motion. With **Sound** enabled, both events have a low procedural rumble. Quakes pause with the simulation and use bounded, expiring effects.

## Island archipelago

Select **Islands** in the dock (or press **I**) to generate an archipelago; select it again to return to the open ocean. The camera pulls back to frame the islands, and the usual orbit, zoom and ball controls remain available. Balls can land and roll on the terrain. Boulders, plants, rock formations and cascades are decorative and do not create separate collision surfaces.

**Settings → Islands** has controls for:

- **Temperate**, **Tropical**, **Volcanic**, **Alpine**, **Desert** or **Mixed** biomes. Tropical coasts grow palms; volcanic islands have dark basalt and crater-like high ground; alpine slopes hold snow; desert islands have sandstone mesas and cacti. Mixed mode assigns different biomes to each island from the seed.
- Wild, Coves or Highlands coast types, three to five islands, mountain height, coastline detail, beaches and landform detail.
- Tree and cactus density, tree height, grasses, boulders, wildflowers, rock formations, cascades and seabirds. Cascades appear on suitable downhill slopes in the wetter biomes.
- Vegetation wind response and cliff-surf intensity.

New installs start with Mixed biomes; settings saved before biomes were added retain their temperate ecology. **New islands** chooses a new seed; **Storm coast** brings in a thunderstorm. The seed and island settings are saved with the other settings, so the same seed and controls recreate the same layout and planting. Terrain controls rebuild the current coast, while vegetation and scenery controls update only those detail layers. Pines, palms and grass bend in wind-driven gusts, rain darkens foliage, winter adds snow, and seabirds shelter during heavy storms and at night.

Storm swells hitting exposed cliffs throw up curling water sheets, fine spray, mist and a fading foam wash. Wind can also tear streaks of spindrift off open-water crests. Water entries include a crown, a jet and, for angled impacts, a directional fan of water. Enable **Sound** in System settings to hear the impacts.

The coastal surface and tree textures in `assets/` are local; no external texture service is required at runtime. Extra palm, basalt and sandstone textures load only when their biomes are used, and low-memory mode limits their upload size. Trees, rocks, grasses, flowers, formations and birds use seeded instancing to keep their populations bounded.

## Rendering controls

**Settings → System** contains render quality, splash detail, motion blur and lens-effect controls. Water uses seeded swell phases shared with physics, wind-aligned detail, shoreline foam and shallow-water caustics. Ball materials include wetness-responsive highlights and reflections.

Motion blur uses depth-aware camera reprojection and visible ball and ship motion, with exposure adjusted for frame time. It does not stretch the ball geometry, and history is reset after a resize or a long frame gap. Reduced-motion preferences disable motion blur by default. On slower devices, lower the render quality or splash detail.

Render targets are limited by the device's WebGL dimensions and a pixel budget, especially on high-DPI touch devices. If a framebuffer allocation fails, Aqua releases the partial targets and retries at a smaller resolution. The canvas itself does not allocate redundant depth or multisample buffers: the scene's depth is stored in the offscreen targets used for refraction and motion blur.

## Graphics recovery

If the browser loses its WebGL context, rendering pauses and Aqua attempts one automatic restart when the context is restored, or after a short wait if the visible tab is not restored. A shader failure without a driver diagnostic is also retried once. Recovery uses low-memory graphics for that page visit: a smaller resolution budget, half-resolution reflections and smaller island textures. Your saved quality and island settings are not changed; reload normally to use them again. If recovery is not possible, the error screen offers **Retry** and **Retry in low-memory mode**, plus the original graphics diagnostic. Repeated failures never trigger an endless reload or error loop. If WebGL 2 cannot be created at all, update the browser and enable hardware acceleration.

## Tests

Run the Node.js tests for graphics startup and recovery, seeded terrain, ship deck collision and sail transparency, quake/wave synchronization, and bounded effects:

```sh
node --test tests/*.test.js
```

For the optional end-to-end WebGL tests, start the static server in another terminal, then use Playwright Core and a WebGL 2-capable Chromium installation (no dependency is needed by the site itself):

```sh
npm install --prefix /tmp/aqua-browser-test --no-save playwright-core
NODE_PATH=/tmp/aqua-browser-test/node_modules CHROMIUM_PATH=/path/to/chromium node tests/webgl-browser.js
NODE_PATH=/tmp/aqua-browser-test/node_modules CHROMIUM_PATH=/path/to/chromium node tests/ship-quake-browser.js
```

Set `AQUA_URL` if the server is not at `http://127.0.0.1:8000/`. On headless machines without a GPU, Chromium may need software-rendering flags, for example `CHROMIUM_FLAGS="--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader"`. The browser tests exercise real shader compilation, desktop swimming and boarding, mobile touch controls and texture limits, quakes, rendering, optional-asset failure, framebuffer retry, and context-loss recovery; they do not replace visual checks on target devices.
