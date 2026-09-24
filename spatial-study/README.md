# Embedded spatial study

Adapted from [keigoyoshida7/desymmetrical-core](https://github.com/keigoyoshida7/desymmetrical-core), revision `21fc685434e73531b36ab3a73c88a7c400a347ba`. Artist: Keigo Yoshida. Original spatial-audio prototype: [Guillaume Piccarreta](https://github.com/gllmp), [gllmp/desymmetrical-adaptation](https://github.com/gllmp/desymmetrical-adaptation). Existing authorship is retained; this adaptation does not assert a new license for upstream work. Distributed dependencies retain their notices in `public/licenses/` and the built `spatial/licenses/` directory.

The editor preserves the reference's room, acrylic, stone, arm, light, motion, source/listener/speaker, Spat mapping, presets and automation controls. Geometry is provisional and is not a hardware or acoustic measurement. It runs in a same-origin frame to isolate styles, control IDs, Three.js and scene state from the listening interface. The editor does not create browser audio or silently apply its scene to the parent audio engine.

The optional **Use analysis from above** control receives only numerical shadow features, input identity and fixed/running state. Camera images are never passed. XY centroids are normalized to −1…1 (image Y is inverted); Z uses darkness in 0…1, keeping sources on or above the floor under the default mapping; penumbra is divided by analysis width; entropy is normalized histogram entropy. These are visual mapping conventions, not measured physical coordinates. Replay takes precedence over the live feed. Scene defaults remain available when the feed is turned off.

JP/EN follows the parent without rebuilding controls. Presets and name sizes use Core Web-specific storage keys, so the reference site's settings are not overwritten. Preset and automation JSON retain the reference Core v2 format.

OSC connections are explicit, including on localhost. The original project's local Max/Spat companion remains available in the reference repository; it is not bundled here. It uses 17 directional feeds with a visual Sub placeholder, unlike the parent browser's 18-channel renderer. The browser audio above is the direct listening path.

## Development

Node 22.12+ is required for the Vite toolchain. From this directory, run `npm ci`, then `npm test` and `npm run build`. The pinned lockfile makes the build reproducible; `vite.config.ts` writes relative assets into `../spatial/`, which is committed for GitHub Pages. No build service or CDN dependency is needed at runtime.

The parent loads the frame when it approaches the viewport and pauses scene animation/recording when the section is off-screen. Height and language messages are accepted only from the same-origin parent. The parent does not accept scene-to-audio commands.
