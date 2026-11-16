# Diffuse sky backdrop

`diffuse-dust-v1.png` is a decorative, AI-generated sky texture created with the
built-in ImageGen tool on 2026-11-15. Its native resolution is 1774 × 887 pixels
(2:1 equirectangular panorama), with an opaque black background.

It is an illustrative layer behind the star catalog, not an astronomical survey,
measured dust map, or source of scientific information. No discrete stars were
included so catalog stars remain the actual selectable objects.

The original generation was copied unchanged into this directory. Keep backdrop
rendering independent of catalog and FITS rendering so the texture can be replaced
or disabled without changing scientific data handling.

## Replacing or disabling the experiment

- Toggle **Diffuse background / Fondo difuso** in Sky appearance for an immediate
  comparison with the original sky.
- Set `SKY_DUST.enabled` to `false` in `src/config/skyDust.js` to start disabled.
- Change the asset import or `opacity` in that config to try another panorama.
  Use a Galactic equirectangular panorama with the center at `(u, v) = (0.5, 0.5)`,
  the north Galactic pole at the top, and longitude increasing to the left.
- `src/three/core/galacticFrame.js` aligns the middle of the texture with the
  Galactic plane and its center with Galactic longitude zero, using the Astropy
  Galactic-to-ICRS transform. The existing `EquatorialFrame` then orients it for
  observer location and sky time. This is a correctly oriented illustrative band,
  not a measured map: individual clouds are invented, and the existing sky frame
  is an approximate visual orientation rather than precision astrometry.
- `src/three/elements/SkyDust.jsx` owns loading, seam blending, and rendering.
  It lives in the background pass, ignores pointer picking, and falls back to
  the original sky if the image cannot load. Removing its mount in `SkyScene`
  removes the effect; no backend, catalog, or FITS changes are needed.

## Generation prompt

```text
Use case: stylized-concept
Asset type: subtle diffuse sky-dust raster texture for an interactive planetarium sky sphere, to sit behind a separate catalog of real stars.
Primary request: generate a photorealistic but decorative, extremely soft and subdued all-sky Milky-Way-like dust glow on an almost black background. It should feel like distant unresolved galactic starlight gently illuminating dusty lanes, viewed after strong optical diffusion. No discrete stars whatsoever; the application adds all stars separately.
Composition/framing: 2:1 equirectangular panorama, ideally 2048 by 1024 pixels. A faint, gently irregular galactic band runs horizontally through the middle of the canvas, spanning the full width; never diagonal. The band occupies roughly the middle third of the height, with diffuse gentle upper and lower falloff. A very subdued, somewhat wider concentration near the center, much dimmer wisps toward the sides. Left and right borders must match seamlessly for 360-degree wrapping. The top and bottom 20 percent are uniform near-black so the sphere poles stay clean.
Lighting/mood: low-contrast, restrained night sky, soft blurred low-frequency luminous clouds with broad dark dust lanes, no sharp details or bright white core. Dense regions must still be dim enough that real stars and small labels can remain legible on top.
Color palette: mostly desaturated charcoal, slate gray-blue and a trace of muted lavender, faint warm ivory haze around the middle; no saturated neon or colorful nebula.
Constraints: full bleed texture only, opaque black background, no landscape, horizon, planets, moons, galaxies with recognizable spiral shapes, individual stars, bright dots, speckles, noise, lens flares, artificial graphics, lines, frame, text, logo or watermark. This is illustrative scenery, not a calibrated scientific sky survey.
```
