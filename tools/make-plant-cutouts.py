#!/usr/bin/env python3
"""Turn magenta-background plant renders into RGBA billboard cutouts.

Aqua's billboard plants are 512x512 RGBA PNGs with the plant's base sitting
just above the bottom edge, so a single instancing shader can root every
species on the terrain. The image model is asked to render each plant on a
flat pure-magenta background because that hue is absent from foliage and
bark; this script keys it out, removes the magenta colour cast that the
background bleeds into translucent leaf edges, and writes the final asset.

Usage:
    python3 tools/make-plant-cutouts.py            # all of assets/plants/raw
    python3 tools/make-plant-cutouts.py agave.png  # one source

Requires Pillow and NumPy (development only; the site itself has no build
step and never runs this script). The raw renders are kept so the keying can
be repeated or tuned. See assets/plants/README.md.
"""
import json
import pathlib
import sys

import numpy as np
from PIL import Image, ImageFilter

ROOT = pathlib.Path(__file__).resolve().parent.parent
RAW = ROOT / "assets/plants/raw"
OUT = ROOT / "assets/plants"
SIZE = 512
# Background colour measured from the flat area of the source renders.
BG = np.array([249.0, 2.0, 241.0], dtype=np.float32)


def smoothstep(edge0, edge1, x):
    t = np.clip((x - edge0) / (edge1 - edge0), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def key_magenta(rgb):
    """Return float RGB and alpha for an image shot against flat magenta.

    Magenta is uniquely identified by both red and blue standing far above
    green, so min(r, b) - g is a robust matte signal: ~240 on the backdrop,
    near zero on foliage, bark and sand. A wide soft ramp keeps antialiased
    leaf edges, and the recovered foreground is un-blended from the known
    backdrop colour so edge pixels do not keep a pink halo.
    """
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    signal = np.minimum(r, b) - g
    alpha = 1.0 - smoothstep(112.0, 196.0, signal)
    # Feather the matte by a fraction of a pixel to avoid stair-stepped edges.
    alpha = np.asarray(
        Image.fromarray((alpha * 255).astype(np.uint8)).filter(
            ImageFilter.GaussianBlur(0.55)
        ),
        dtype=np.float32,
    ) / 255.0
    safe = np.clip(alpha, 0.04, 1.0)[..., None]
    fg = np.clip((rgb - (1.0 - safe) * BG) / safe, 0.0, 255.0)

    # Despill: any pixel whose red and blue both exceed green is carrying
    # background contamination (translucent leaves are the usual culprit).
    # Replace that cast with a green of the same luminance so leaf edges read
    # as leaves rather than as pink flowers.
    r, g, b = fg[..., 0], fg[..., 1], fg[..., 2]
    luma = 0.299 * r + 0.587 * g + 0.114 * b
    cast = np.maximum(0.0, np.minimum(r, b) - g)
    blend = np.clip(cast / 34.0, 0.0, 1.0) * 0.94
    target = np.stack([luma * 0.40 / 0.62, luma * 0.88 / 0.62, luma * 0.34 / 0.62], axis=-1)
    fg = fg * (1.0 - blend[..., None]) + target * blend[..., None]
    # Final light despill for residual tint at the very edge.
    for _ in range(2):
        r, g, b = fg[..., 0], fg[..., 1], fg[..., 2]
        excess = np.maximum(0.0, np.minimum(r, b) - g)
        fg[..., 0] = r - excess
        fg[..., 2] = b - excess
    return np.clip(fg, 0.0, 255.0), alpha


def cutout(source, destination):
    image = Image.open(source).convert("RGB")
    rgb = np.asarray(image, dtype=np.float32)
    fg, alpha = key_magenta(rgb)
    rgba = np.dstack([fg, alpha * 255.0]).astype(np.uint8)
    sprite = Image.fromarray(rgba, "RGBA")

    # Crop to the plant, then fit it into a common square canvas with the
    # base anchored just above the bottom edge. Keeping one canvas size lets
    # every species share a single texture array and one instanced draw.
    bbox = sprite.getchannel("A").point(lambda v: 255 if v > 6 else 0).getbbox()
    if not bbox:
        raise SystemExit(f"{source.name}: nothing left after keying")
    sprite = sprite.crop(bbox)
    width, height = sprite.size
    margin = 1.5 / 100.0
    scale = (SIZE * (1.0 - margin * 2.0)) / max(width, height)
    new_size = (max(1, round(width * scale)), max(1, round(height * scale)))
    sprite = sprite.resize(new_size, Image.LANCZOS)
    canvas = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    canvas.paste(sprite, ((SIZE - new_size[0]) // 2, SIZE - 4 - new_size[1]), sprite)
    canvas.save(destination, optimize=True)

    # The shader needs the silhouette's aspect ratio to keep every species at
    # its intended height without a stretched billboard.
    return {
        "file": destination.name,
        "source": source.name,
        "sourcePixels": [rgb.shape[1], rgb.shape[0]],
        "aspect": round(new_size[0] / new_size[1], 4),
        "pixels": [SIZE, SIZE],
        "bytes": destination.stat().st_size,
    }


def main(argv):
    sources = sorted(RAW.glob("*.png"))
    if len(argv) > 1:
        wanted = set(argv[1:])
        sources = [p for p in sources if p.name in wanted]
    if not sources:
        raise SystemExit("no raw renders found in assets/plants/raw")
    report = []
    for source in sources:
        destination = OUT / source.name
        info = cutout(source, destination)
        report.append(info)
        print(f"{source.name:22s} -> {destination.name:22s} aspect {info['aspect']:.3f}  {info['bytes']//1024} KiB")
    manifest = OUT / "plants.json"
    existing = {}
    if manifest.exists():
        try:
            existing = json.loads(manifest.read_text())
        except ValueError:
            existing = {}
    entries = {entry["file"]: entry for entry in existing.get("plants", [])}
    for entry in report:
        entries[entry["file"]] = entry
    manifest.write_text(
        json.dumps(
            {
                "comment": "Generated by tools/make-plant-cutouts.py. Alpha cutouts, base anchored at the bottom edge.",
                "plants": sorted(entries.values(), key=lambda e: e["file"]),
            },
            indent=2,
        )
        + "\n"
    )
    print(f"\nwrote {manifest.relative_to(ROOT)}")
    print("aspect table for js/island-scenery.js:")
    for entry in report:
        print(f"  {entry['file']}: {entry['aspect']}")


if __name__ == "__main__":
    main(sys.argv)
