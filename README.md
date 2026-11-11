# Aqua

A real-time WebGL 2 ocean and ball-physics showcase. It is a static site with no build step; serve this directory from any static web server, for example:

```sh
python3 -m http.server 8000
```

Open `http://localhost:8000` in a WebGL 2 capable browser.

## Island archipelago

Select **Islands** in the dock (or press **I**) to generate five separated islands; select it again to return to the open ocean. The camera pulls back to frame the archipelago, and the usual orbit and zoom controls remain available. Balls can land and roll on the terrain.

In **Settings → Scene**, use **New islands** to regenerate the coast or **Storm coast** to bring in a thunderstorm. Strong swells hitting exposed cliffs create breaking surf, rising spray, mist and falling white water. Enable **Sound** in the System settings to hear the impacts. Winter also adds snow to high ground. The island setting and generated terrain seed are saved with the other settings.

The local, AI-generated coastal surface and tree textures are included in `assets/`; no external texture service is required at runtime.

## Tests

The procedural terrain, separation, collision and storm-impact logic can be tested with Node.js:

```sh
node --test tests/islands.test.js
```
