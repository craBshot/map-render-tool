# Map_Render_Tool

Browser tool that renders animated map flights (zoom from country to region, target marker with pulse) and exports them as MP4 or image sequence for DaVinci Resolve. Private project, single user, used roughly once a week while editing videos.

## Language

- Code, comments, commit messages, docs and this file: **English**.
- UI strings live in one central translation file. Default UI language: **German**. English can be added later.
- The user often writes prompts in German. Answer in the language of the prompt.

## Deployment and hard constraints

- Web app, shipped as a static build via Docker (multi-stage: Node builds, nginx serves), behind Caddy. Reachable only on the local network or via WireGuard.
- MP4 export (WebCodecs) requires a secure context: HTTPS, `localhost`, or an HTTP origin whitelisted via browser flag. Everything else works over plain HTTP. Without a secure context the app must say so clearly and point to the image sequence export.
- No backend unless explicitly decided. No accounts, no API keys.
  - Exception: the **area-db worker** (see Tech below) is a small backend process, explicitly decided on to work around the shared Overpass instance's unreliability. It must stay fully dockerized — `docker compose up`/`down` only, no extra setup, no required configuration.
- Ask before adding dependencies. All libraries as pinned npm packages, no CDN includes.

## Tech

- **Stack:** Vite + React + TypeScript. Keep UI components small; do not bury map logic inside components.
- **Architecture:** One serializable project state (JSON: camera start/end, objects, style, timing, export settings) is the single source of truth. Rendering a frame is a pure function of state + time. Preview and export use the same function.
- **Folders:** `src/map/` (MapLibre, layers, camera), `src/timeline/` (timing, animations), `src/export/` (MP4, image sequence), `src/state/` (project state, save/load, migrations), `src/ui/` (components), `src/i18n/` (UI strings), `worker/` (area-db background service — see Tech).
- **MapLibre GL JS 4.7.1** (intentionally pinned). v5 changes e.g. `preserveDrawingBuffer` → `canvasContextAttributes`. Upgrade only as a dedicated task.
- **Map data:** OpenFreeMap styles (positron, liberty, bright, dark, fiord), no key.
- **Place search:** Nominatim. Respect the usage policy: max 1 request/s, no search-as-you-type.
- **Area lookup:** local-first, live-Overpass fallback.
  - **Local:** `worker/` is a small, dependency-free Node process (runs its TypeScript directly via `node --experimental-strip-types`, no build step, no ts-node/tsx) that slowly and continuously builds a local area database in a Docker volume: one work item (one country's cheap enumeration query, or one area's geometry fetch) per tick (90s), Germany first, then the rest of Europe down to Kreis-level (admin_level 2-6), then the rest of the world at country/state level only (admin_level 2+4) — protected areas/national parks/nature reserves everywhere. Within a country, administrative boundaries and national parks are fetched before the much longer nature-reserve tail (Germany alone enumerates to ~14,000 items, dominated by nature reserves). nginx proxies `/area-db/*` to it; `src/map/areaLookup.ts` queries it first and treats any failure (including the worker being absent, e.g. under `npm run dev`) as a local miss.
  - **Live fallback:** Overpass API (`https://overpass-api.de/api/interpreter`), a shared public instance — fair use only: on-demand single queries triggered by an explicit pick-click, never batched/background/polling (the local worker's own background queries are the one deliberate, disclosed exception — see above). Two-step: a cheap `is_in()`/tags-only query lists candidates at a point; geometry (`out geom;`) is fetched only for the element the user actually picks. Requests need an identifying `User-Agent` header — Overpass returns 406 for Node's default one.
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
- Project files carry a version number. When the data format changes, add a migration; old projects must still load.

## Commands

- `npm run dev` – dev server
- `npm test` – unit tests
- `npm run test:e2e` – Playwright
- `npm run build` – production build to `dist/`
- `docker compose up -d --build` – build and serve

## Workflow

- Plan new features in plan mode first and present the plan.
- Small steps, **one commit per finished change**, descriptive commit messages.
- Run tests after every change. For visible changes, take a Playwright screenshot and check it.
- No unrequested refactors outside the task.

## Tests

- Unit tests (Vitest) for pure logic: camera curve, timing, marker animation, migrations.
- End-to-end with Playwright and Chromium. External services (tiles, styles, Nominatim) are mocked via route interception so tests run offline and reproducibly.
- Required cases: page loads without console errors, marker visible (also after a style change), right-click sets marker, preview runs, MP4 export produces a valid file with the correct frame count (check with ffprobe if available).

## Planned features (in order)

1. **Multiple markers:** list instead of dropdown (color swatch, name, visibility, delete). Per marker: position, name as optional map label, appear time. "Apply style to all" copies only color, size and pulse.
2. **Save/load projects** as JSON file (server-side storage optional later).
3. **Highlight areas:** right-click mode toggle (marker vs. area) queries a point, showing every containing area (administrative levels *and* non-administrative ones like nature reserves/national parks — Nominatim's reverse geocoding can't do this, it only walks the administrative parent chain), local area-db first with a live Overpass fallback (see Tech). Picked areas land in an ordered list (order = stacking order); each references a named style (fill/outline/appear-timing) from a small separate style palette. Which candidate types are even offered is user-configurable (a settings panel), not hardcoded. A simple polygon tool for areas without an official boundary is still open.
4. **Routes:** route via public OSRM demo server (low usage, ~10 requests per editing day), line drawn progressively frame by frame in the export.

Markers, areas and routes should eventually live in **one shared object list** with a unified timing model.
