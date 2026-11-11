# Aqua

A real-time WebGL 2 ocean and ball-physics showcase. It is a static site with no build step; serve this directory from any static web server, for example:

```sh
python3 -m http.server 8000
```

Open `http://localhost:8000` in a WebGL 2 capable browser.

## Island archipelago

Select **Islands** in the dock (or press **I**) to generate an archipelago; select it again to return to the open ocean. The camera pulls back to frame the islands, and the usual orbit, zoom and ball controls remain available. Balls can land and roll on the terrain. Boulders and grasses are decorative and do not create separate collision surfaces.

**Settings → Islands** has controls for:

- Wild, Coves or Highlands terrain, three to five islands, mountain height, coastline detail and beach size.
- Forest density and tree height, grasses, boulders and seabirds.
- Vegetation wind response and cliff-surf intensity.

**New islands** chooses a new seed; **Storm coast** brings in a thunderstorm. The seed and island settings are saved with the other settings, so the same seed and controls recreate the same layout and planting. Terrain controls rebuild the current coast, while vegetation and rock controls update only those detail layers. Trees and grass bend in wind-driven gusts, rain darkens foliage, winter adds snow, and seabirds shelter during heavy storms and at night.

Storm swells hitting exposed cliffs throw up curling water sheets, fine spray, mist and a fading foam wash. Wind can also tear streaks of spindrift off open-water crests. Water entries include a crown, a jet and, for angled impacts, a directional fan of water. Enable **Sound** in System settings to hear the impacts.

The coastal surface and tree textures in `assets/` are local; no external texture service is required at runtime. Trees, rocks, grasses and birds use seeded instancing to keep their populations bounded.

## Rendering controls

**Settings → System** contains render quality, splash detail, motion blur and lens-effect controls. Water uses seeded swell phases shared with physics, wind-aligned detail, shoreline foam and shallow-water caustics. Ball materials include wetness-responsive highlights and reflections.

Motion blur uses depth-aware camera reprojection and visible ball motion, with exposure adjusted for frame time. It does not stretch the ball geometry, and history is reset after a resize or a long frame gap. Reduced-motion preferences disable motion blur by default. On slower devices, lower the render quality or splash detail.

## Tests

Run the CPU-side tests for seeded terrain, island detail and collision, wave synchronization, and bounded surf and particle lifecycles with Node.js:

```sh
node --test tests/*.test.js
```

The shaders and rendering passes also need a WebGL 2 capable browser for visual testing.
