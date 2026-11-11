# Aqua

A real-time WebGL 2 ocean and ball-physics showcase. It is a static site with no build step; serve this directory from any static web server, for example:

```sh
python3 -m http.server 8000
```

Open `http://localhost:8000` in a WebGL 2 capable browser.

## Island archipelago

Select **Islands** in the dock (or press **I**) to generate five separated islands; select it again to return to the open ocean. The camera pulls back to frame the archipelago, and the usual orbit and zoom controls remain available. Balls can land and roll on the terrain.

In **Settings → Scene**, use **New islands** to regenerate the coast or **Storm coast** to bring in a thunderstorm. Strong swells hitting exposed cliffs create torn sheets of water, fine spray, mist and a fading foam wash. Enable **Sound** in the System settings to hear the impacts. Winter also adds snow to high ground and trees. The island setting and generated terrain seed are saved with the other settings.

The local, AI-generated coastal surface and tree textures are included in `assets/`; no external texture service is required at runtime. Forest clusters, tree sizes and the coastline are reproducible from the saved seed.

## Rendering controls

**Settings → System** contains render quality, splash detail, motion blur and lens-effect controls. Motion blur uses depth-aware camera reprojection and visible ball motion, with exposure adjusted for frame time. It does not stretch the ball geometry, and history is reset after a resize or a long frame gap. Reduced-motion preferences disable motion blur by default.

## Tests

Run the CPU-side terrain, collision, seeded vegetation, surf lifecycle and particle-budget tests with Node.js:

```sh
node --test tests/*.test.js
```

The shaders and rendering passes also need a WebGL 2 capable browser for visual testing.
