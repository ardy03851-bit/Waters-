# Night and advanced VFX

This pass has two halves that share one switch: the night look, and the
`Advanced VFX` master level that upgrades every effect in the scene.

## The VFX level

`Advanced VFX` lives under **Settings → System** and is exposed to scripts as
`Aqua.vfx('off' | 'enhanced' | 'cinematic')` (no argument reports the level).
It is one global integer, `vfxLevel`:

| Level | Name | Behaviour |
| --- | --- | --- |
| 0 | off | The original effects path; every advanced branch is skipped. |
| 1 | enhanced | Sun/moon shafts, lens flare + dirt + anamorphic bloom, far depth of field, extra foam detail, breaker aerosol, denser spray/rain, night fireflies and plankton. |
| 2 | cinematic | Level 1 at full strength, a wider two-stage bloom pyramid, stronger shafts and flare, a touch more grain. |

Low-memory mode clamps the level to 0 in `setVFX()`, and the shader receives
the number through `uVFX` (declared in `COMMON`, fed by `setSky`). The post
shader receives it separately with its own uniforms.

Nothing is rebuilt when the level changes: only uniforms and the next frame's
particle budgets read it. The fireflies are reseeded into a buffer that is
already allocated; no texture or program is created.

## Post-processing

`js/shaders.js` (`POST_FS`) and `js/render.js` add:

- **Volumetric light shafts.** Ten depth-tested samples march from each pixel
  toward the sun (or moon after dark). Only sky pixels contribute, so a ridge
  or an island genuinely blocks the shaft. Colour shifts from warm sunlight to
  cool moonlight with `uNight`.
- **Lens flare.** Four tinted ghosts on the optical axis, a halo ring and a
  dust layer that is lit only by bright highlights. The dust plate is
  `assets/vfx/lens-dirt.png`, with a black 1×1 fallback.
- **Anamorphic bloom.** A thin horizontal streak sampled from the bloom target;
  at level 2 the bloom pyramid runs a second, wider horizontal/vertical pair
  (`uSpread = 2.6`) before it is composited.
- **Far depth of field.** Four bilinear taps weighted by depth beyond roughly
  130 m, giving the horizon and distant islands atmospheric separation without
  touching the foreground.
- **Lens character.** Chromatic aberration and vignette receive a small boost,
  and level 2 adds a fine grain even when improved mode is off.

At night the bloom threshold drops from 0.68 to 0.46, which lets moonlight,
stars and glowing foam bleed instead of disappearing.

## Water and particles

- Water gains a finer bubble lace and a low aerosol haze over breakers at
  levels 1–2, plus a sharper moon path (`a` is reduced at night and the glitter
  is boosted) and cyan bioluminescence in breaking foam and the shore wash.
- Splash budgets (`budget()`), cliff mist count, shore-wash cadence, surf-sheet
  cadence, rain density and rain splashes all scale gently with the level.
- Shore wash emits aerosol puffs, and after dark emits **plankton** particles
  (kind 5 in `js/splash.js`): soft, cold, premultiplied glow motes that drift
  and fade. The particle shader has a dedicated branch for them.

## Night

`js/environment.js`:

- the moon contributes more light (0.22 instead of 0.17), its disc is larger
  and ambient is lifted by `0.035 * moonUp`;
- the zenith and horizon receive a small blue lift when the moon is up;
- `sky.moonUp` is exported for any effect that wants to follow the moon.

`COMMON.skyCol()` (shared by the sky, water reflections and terrain):

- two star layers with different density, brightness, colour temperature and
  twinkle phases;
- a galactic band, modulated by directional noise and dust lanes;
- a short shooting star every few seconds, seeded by time;
- a layered moon halo (tight disc, atmospheric ring, wide scattering glow);
- a faint green-blue airglow near the horizon.

`COAST_FOAM_FS` and `SURF_FS` pick up a faint cyan emissive tint at night, so
the surf stays readable and matches the water.

Harbour and ship lights are part of the night pass even at VFX Off. Every
working boat within 260 m of the camera shows a warm cabin lamp and a blinking
white masthead; the ship adds a deck lamp, a stern light and a red port light.
They are one additive instanced draw of at most 64 glow sprites, rebuilt from
the live fleet each frame.

## Fireflies

`js/vfx.js` seeds up to 220 glow points over non-desert, non-volcanic islands
(90 at enhanced, 180 at cinematic). Positions are evaluated once per
archipelago/level change; drift and pulse are computed in the vertex/fragment
shaders from one seed each. They are drawn additively with depth testing, and
only when `sky.night > 0.12`, precipitation is low and the wind is under gale
force.

## Performance notes

- Level 0 costs exactly the old frame; no extra passes or fetches are taken.
- The glowing particles reuse the existing pool; the budgets are percentage
  increases, not new systems.
- Fireflies are one instanced draw call with four vertices per point.
- The post additions are one full-screen pass: ten depth taps for the shafts,
  six bloom taps for the streak, four for the far blur. All are branch-guarded
  so a still, daylight frame pays only the uniform checks.
- The lens-dirt plate is 512×512 and about 73 KB.

## Tests

`node --test tests/*.test.js` includes `tests/vfx.test.js`:

- the three levels, unknown-name fallback and low-memory clamp;
- a clear midnight: full `sky.night`, moon above the horizon, lifted ambient,
  blue zenith;
- a seeded firefly population that floats above the sampled ground, and the
  day-time no-op.
