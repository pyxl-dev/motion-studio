# Third-party code

Vendored in `public/vendor/`, all under the MIT license:

- `three.module.min.js`: three.js r170, https://threejs.org (Copyright 2010-2024 Three.js Authors).
- `three-gpu.min.js`: three.js r187 WebGPU build, TSL and post-processing addons, bundled as one ES module.
- `mp4-muxer.mjs`: mp4-muxer 5.2.2 by Vanilagy, https://github.com/Vanilagy/mp4-muxer, with a small patch (search "Motion Studio patch") that writes an MP4 edit list on the audio track to trim encoder priming.

Fonts (Inter, Bricolage Grotesque, Space Grotesk, Instrument Serif, JetBrains Mono) are loaded from Google Fonts at runtime, under the SIL Open Font License.
