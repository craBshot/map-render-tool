# Map_Render_Tool

Browser tool that renders animated camera flights across a map — with markers, highlighted areas and routes, each timed on a Timeline — and exports them frame by frame as MP4 or image sequence for DaVinci Resolve. Personal proof of concept, public on GitHub as a portfolio piece (see README disclaimer); single user, used roughly once a week while editing videos.

## Language

- Code, comments, commit messages, docs and this file: **English**.
- UI strings live in `src/i18n/`. Active UI language: **German**. `strings.en.ts` is kept complete (add every new string in both files) but not wired up yet — no language switcher.
- The user often writes prompts in German. Answer in the language of the prompt.

## Deployment and hard constraints

- Web app, shipped as a static build via Docker (multi-stage: Node builds, nginx serves). The author runs it behind Caddy, reachable only on the local network or via WireGuard. Not hardened for the public internet (no auth) — documented in the README's Limitations.
- MP4 export (WebCodecs) requires a secure context: HTTPS, `localhost`, or an HTTP origin whitelisted via browser flag. Everything else works over plain HTTP. Without a secure context the app must say so clearly and point to the image sequence export.
- No backend unless explicitly decided. No accounts, no API keys.
  - Exception: the **area-db worker** (see Tech below) is a small backend process, explicitly decided on to work around the shared Overpass instance's unreliability. It must stay fully dockerized — `docker compose up`/`down` only, no extra setup, no required configuration.
- Ask before adding dependencies. All libraries as pinned npm packages, no CDN includes.

## Tech

- **Stack:** Vite + React + TypeScript. Keep UI components small; do not bury map logic inside components.
- **Architecture:** One serializable project state (JSON: name, camera waypoints, markers, areas, routes, style, export settings) is the single source of truth. Rendering a frame is a pure function of state + time. Preview and export use the same function.
- **Every project edit goes through `useProjectStore.setProject`** (`src/state/store.ts`): persistence, the undo/redo history and the camera auto-extend all hang off that one path. Never write the project anywhere else; replacing it wholesale (opening a file) uses `replaceProject`.
- **Video length = camera flight.** Objects are timed within it. When an edit makes an object end later than the video, the camera's last hold is extended (`src/timeline/autoExtend.ts`) — never shortened automatically, and deferred to pointer release during drags.
- **Folders:** `src/map/` (MapLibre, layers, camera), `src/timeline/` (timing, animations), `src/export/` (MP4, image sequence), `src/state/` (project state, save/load, migrations), `src/ui/` (components), `src/i18n/` (UI strings), `worker/` (area-db background service — see Tech).
- **MapLibre GL JS 6.x.** Worker is shipped as a Vite `?url` asset + `setWorkerUrl()` (MapController.ts); nginx must serve `.mjs` as JavaScript. e2e tests use a tile-less mock style and do not exercise the worker.
- **Map data:** OpenFreeMap styles (positron, liberty, bright, dark, fiord), no key.
- **Place search:** Nominatim. Respect the usage policy: max 1 request/s, no search-as-you-type.
- **Area lookup:** local-first, live-Overpass fallback.
  - **Local:** `worker/` is a small, dependency-free Node process (runs its TypeScript directly via `node --experimental-strip-types`, no build step, no ts-node/tsx) that slowly and continuously builds a local area database in a Docker volume: one work item (one country's cheap enumeration query, or one area's geometry fetch) per tick (90s), Germany first, then the rest of Europe down to Kreis-level (admin_level 2-6), then the rest of the world at country/state level only (admin_level 2+4) — protected areas/national parks/nature reserves everywhere. Within a country, administrative boundaries and national parks are fetched before the much longer nature-reserve tail (Germany alone enumerates to ~14,000 items, dominated by nature reserves). nginx proxies `/area-db/*` to it; `src/map/areaLookup.ts` queries it first and treats any failure (including the worker being absent, e.g. under `npm run dev`) as a local miss.
  - **Live fallback:** Overpass API (`https://overpass-api.de/api/interpreter`), a shared public instance — fair use only: on-demand single queries triggered by an explicit pick-click, never batched/background/polling (the local worker's own background queries are the one deliberate, disclosed exception — see above). Two-step: a cheap `is_in()`/tags-only query lists candidates at a point; geometry (`out geom;`) is fetched only for the element the user actually picks. Requests need an identifying `User-Agent` header — Overpass returns 406 for Node's default one.
- **Routing:** OSRM demo server (`https://router.project-osrm.org`), fair use only (~10 requests per editing day, on-demand). Always requests the `driving` profile — verified live that `walking`/`cycling` return byte-identical distance/duration on the public demo instance (it's evidently backed by a single car-only graph), so there is no real profile choice and no profile picker in the UI. `geometries=geojson&overview=full` returns the whole multi-waypoint route as one combined `LineString` directly — no polyline-decoding dependency needed, and multi-waypoint requests are already routed sequentially through every waypoint in order by OSRM itself. Alternative: a locally-computed straight line between waypoints, no request at all.
- **Export:** MP4 via WebCodecs (H.264) + `mp4-muxer`; image sequence via JSZip.
- **Reference:** `legacy/karten-zoom.html` is the working single-file version. Match its behavior when porting.

## Known pitfalls (do not reintroduce)

- Use `map.setStyle(url, { diff: false })`. With diffing, `style.load` does not fire and marker/label settings get lost.
- After every style change, re-create custom sources/layers (markers etc.) and re-apply label settings.
- Export is **deterministic per frame**: compute state from time, `jumpTo`, wait for `idle`, then read the canvas. Never record real-time animations.
- `fadeDuration: 0`, otherwise labels are half-faded in frames.
- Set export resolution via `setPixelRatio`, not container size, so the framing matches the preview.
- Zoom values are stored normalized to a 1000 px reference width (`zr`) so window size and resolution do not change the framing.
- Attribution is drawn into the canvas (DOM elements are not part of the export).
- Crosshair and coordinate readout are DOM overlays and must never appear in exports.
- Project files carry a version number. When the data format changes, add a migration; old projects must still load — from localStorage and from saved `.maprender.json` files (which also carry an `app: "map-render-tool"` header that `parseProjectFile` checks).
- Browsers pause rendering in hidden tabs; the export waits until the tab is visible again instead of capturing stale frames. Keep it that way.
- Version shown in the Sidebar comes from `package.json` (bump only for real releases) plus the git commit hash read at build time.

## Commands

- `npm run dev` – dev server
- `npm test` – unit tests
- `npm run test:e2e` – Playwright
- `npm run build` – production build to `dist/`
- `docker compose up -d --build` – build and serve

## Workflow

- Plan new features in plan mode first and present the plan.
- Changes go in via PRs against `main` (never stacked on other PR branches); the user reviews and merges.
- Small steps, **one commit per finished change**, descriptive commit messages.
- Run tests after every change. For visible changes, take a Playwright screenshot and check it.
- No unrequested refactors outside the task.

## Tests

- Unit tests (Vitest) for pure logic: camera curve, timing, marker animation, migrations.
- End-to-end with Playwright and Chromium. External services (tiles, styles, Nominatim, Overpass, OSRM, area-db) are mocked via route interception so tests run offline and reproducibly. The mock style has no tiles, so e2e never exercises MapLibre's worker or real rendering — check those with a real-map Playwright script/screenshot when touching map or export code.
- Playwright reuses an already running server on port 4173 (`reuseExistingServer`). Stop any `vite preview` you started yourself before running e2e, or the tests silently run against an old build.
- Required cases: page loads without console errors, marker visible (also after a style change), right-click sets marker, preview runs, MP4 export produces a valid file with the correct frame count (check with ffprobe if available).

## Status

Done: multiple markers, area highlighting (local area-db + Overpass fallback, style palette, configurable candidate types), multiple routes (OSRM or straight line, per-leg timing, snapping between routes), Timeline with drag editing, undo/redo, camera auto-extend, project save/open (`.maprender.json`, drag & drop), MP4/image-sequence export.

Open ideas (none committed to):
- Polygon tool for areas without an official boundary.
- Wire up the English UI (language switcher).
- `areaLookup.ts`: the local-db fallback decides per lookup, not per area kind (known, deferred).
- Markers, areas and routes in one shared object list with a unified timing model.
- Server-side project storage (files are enough for now).
