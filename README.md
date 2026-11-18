# Motion Studio

A motion design editor that runs in the browser, built so that an AI agent can write the animation and a person can retouch it by hand.

- Timeline with keyframes and easing, inspector, text, shape, image and video layers.
- Script layers in Canvas 2D and Three.js (WebGL r170, and WebGPU r187 with TSL), sandboxed in an iframe, with optional post-processing (ambient occlusion, depth of field, bloom, motion blur).
- Sound layers mixed into the export.
- Export to MP4 (H.264 + AAC, frame by frame with WebCodecs, so the video is smooth even on a slow machine), WebM and PNG, entirely in the browser.
- A motion is one JSON document. A script or an agent pushes it, any open editor reloads at once, and feedback pinned to an instant of the timeline goes back to the agent.

The interface is in French for now.

## Run it

Needs [Bun](https://bun.sh) and a Chromium-based browser (WebCodecs for the export; Safari and Firefox fall back to real-time recording).

```bash
bun server.ts            # http://127.0.0.1:5317, data in ./data
PORT=8080 DATA_DIR=~/motions bun server.ts
```

No dependencies to install. The server stores motions as JSON files, uploaded media in `data/media/`, and feedback in `data/comments.json`. It has no authentication: keep it on localhost or put it behind your own proxy.

## Let an agent write the motion

The document format and the script API are in [docs/format.md](docs/format.md). Give that file to your agent, then:

```bash
bun tools/motion.ts push teaser.json teaser     # create or replace, prints the editor link
bun tools/motion.ts pull teaser teaser.json     # get the version retouched in the editor
bun tools/motion.ts media logo.png capture.png  # upload files, prints their /media/... paths
bun tools/motion.ts feedback                    # notes left in the editor, with the instant
bun tools/motion.ts done 3 "Bigger title"       # answer a note and mark it done
```

Set `MOTION_STUDIO_URL` to reach a server elsewhere, and `MOTION_AUTHOR` to name the writer shown in the editor.

## Layout

```
server.ts              HTTP server and JSON API (Bun, no dependencies)
tools/motion.ts        command line for scripts and agents
public/app.js          shell: router and the host helpers the editor uses
public/studio/         the editor: studio.js (UI), engine.js (compositor), runtime.html
                       (script sandbox), frames.js, video.js, audio.js, templates.js
public/vendor/         three.js and mp4-muxer (see THIRD_PARTY.md)
docs/format.md         motion document format and script API
```

## License

MIT, see [LICENSE](LICENSE). Third-party code: [THIRD_PARTY.md](THIRD_PARTY.md).
