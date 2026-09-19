export const PROJECT_VERSION = 5

/**
 * crypto.randomUUID() requires a secure context, but this app must also
 * work over plain HTTP (CLAUDE.md) — so ids are generated without it.
 */
export function generateId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

export type StyleId = 'positron' | 'liberty' | 'bright' | 'dark' | 'fiord'

export type ExportFormat = 'mp4' | 'jpeg' | 'png'

export type ResolutionPreset =
  | '1920x1080'
  | '3840x2160'
  | '1080x1920'
  | '1080x1080'
  | '2160x2160'
  | '1080x1350'
  | 'custom'

export interface CameraPoint {
  lng: number
  lat: number
  /** Zoom normalized to a 1000px reference width so window size/resolution don't change the framing. */
  zr: number
}

export interface CameraWaypoint extends CameraPoint {
  id: string
  /** Time to stay here once arrived, before continuing (or before the project ends, for the last waypoint). */
  holdSec: number
  /** Time to fly TO this waypoint from the previous one. Unused (always 0) on the first waypoint. */
  travelSec: number
}

/** A camera "flight": a chain of waypoints, each held then flown to. Minimum 2 (UI-enforced, not type-enforced). */
export interface CameraState {
  waypoints: CameraWaypoint[]
}

/**
 * Shared appear/hold/disappear timing for "fixed" objects (markers, area
 * styles) — plain absolute project-seconds, positioned directly rather
 * than resolved against camera phases (there's no longer one canonical
 * "the zoom phase" once the camera is a waypoint chain). Routes use a
 * plain { startSec } instead (see RouteObject) — they don't fade.
 */
export interface AppearTiming {
  startSec: number
  fadeInSec: number
  /** undefined = stays visible until the project ends (default). */
  holdSec?: number
  /** 0 = no fade-out (default). */
  fadeOutSec: number
}

export interface StyleState {
  id: StyleId
  labelDensity: 0 | 1 | 2 | 3
  germanNames: boolean
  hideMinorLabels: boolean
}

export interface MarkerObject {
  id: string
  /** Optional label drawn next to the marker on the map (and in exports). */
  name?: string
  lng: number
  lat: number
  color: string
  sizePx: number
  pulse: {
    enabled: boolean
    periodSec: number
    scale: number
    /** Halo opacity fraction (0..1), not a percentage. */
    strength: number
  }
  appear: AppearTiming
  visible: boolean
}

export interface AreaStyle {
  id: string
  name: string
  fill: { enabled: boolean; color: string; opacity: number }
  outline: { enabled: boolean; color: string; widthPx: number; dashed: boolean }
  appear: AppearTiming & {
    // Reserved for a future pulse effect (MapLibre has no built-in polygon
    // pulse primitive like the marker's circle halo) — not implemented yet.
    pulse?: { enabled: boolean; periodSec: number; strength: number }
  }
}

export interface AreaObject {
  id: string
  /** From the picked Overpass tag, editable afterward. */
  name: string
  /** null = "none" — in the list but not highlighted. */
  styleId: string | null
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon
  /** Provenance only — never re-fetched from this. */
  source: { osmType: 'way' | 'relation'; osmId: number }
  visible: boolean
}

export function resolveAreaStyle(styleId: string | null, styles: AreaStyle[]): AreaStyle | null {
  if (styleId === null) return null
  return styles.find((s) => s.id === styleId) ?? null
}

export type RoutingMode = 'osrm' | 'straight'
export type RouteReveal = 'instant' | 'progressive'

export interface RouteWaypoint {
  lng: number
  lat: number
}

export interface RouteObject {
  id: string
  /** Order: [start, ...via-points, destination]. */
  waypoints: RouteWaypoint[]
  routingMode: RoutingMode
  /** osrm: null until "Route berechnen" succeeds. straight: always kept in sync with waypoints. */
  geometry: GeoJSON.LineString | null
  /** OSRM's own travel-time estimate — informational only, always null for routingMode === 'straight'. */
  osrmDurationSec: number | null
  color: string
  widthPx: number
  visible: boolean
  appear: { startSec: number }
  /** 'instant' = shows fully at appear time. 'progressive' = draws in over drawDurationSec. */
  reveal: RouteReveal
  /** Only relevant when reveal === 'progressive'. Fixed draw duration in seconds. */
  drawDurationSec: number
}

export interface ExportSettings {
  resolution: { preset: ResolutionPreset; width: number; height: number }
  fps: 24 | 25 | 30 | 50 | 60
  format: ExportFormat
  /** Bitrate multiplier, only used for the mp4 format. */
  quality: number
  showAttribution: boolean
}

/**
 * The single serializable source of truth for a project. Rendering a frame
 * is a pure function of this state plus a point in time.
 */
export interface ProjectFile {
  version: number
  camera: CameraState
  style: StyleState
  // A single-element list already, so the later move to a shared
  // markers/areas/routes object list (planned feature 1+) is additive.
  markers: MarkerObject[]
  // Order is stacking order: earlier entries render on top.
  areas: AreaObject[]
  areaStyles: AreaStyle[]
  // Single route for v1 — additive to widen into a list later, same as markers.
  route: RouteObject | null
  export: ExportSettings
}

export function createDefaultMarker(lng: number, lat: number): MarkerObject {
  return {
    id: generateId(),
    lng,
    lat,
    color: '#2f6bff',
    sizePx: 9,
    pulse: { enabled: true, periodSec: 1.6, scale: 3.2, strength: 0.45 },
    // startSec 5 = today's default (arrival at the last waypoint) resolved against the default camera below.
    appear: { startSec: 5, fadeInSec: 0.4, holdSec: undefined, fadeOutSec: 0 },
    visible: true,
  }
}

export function createDefaultCameraWaypoint(
  lng: number,
  lat: number,
  zr: number,
  overrides: Partial<Pick<CameraWaypoint, 'holdSec' | 'travelSec'>> = {},
): CameraWaypoint {
  return {
    id: generateId(),
    lng,
    lat,
    zr,
    holdSec: 1,
    travelSec: 3,
    ...overrides,
  }
}

export function createDefaultAreaStyle(name: string, overrides: Partial<Omit<AreaStyle, 'id' | 'name'>> = {}): AreaStyle {
  return {
    id: generateId(),
    name,
    fill: { enabled: true, color: '#2f6bff', opacity: 0.25 },
    outline: { enabled: true, color: '#2f6bff', widthPx: 2, dashed: false },
    appear: { startSec: 0, fadeInSec: 0.6, holdSec: undefined, fadeOutSec: 0 },
    ...overrides,
  }
}

/** The starter style palette seeded into new projects and migrated-up old ones. */
export function createDefaultAreaStyles(): AreaStyle[] {
  return [
    createDefaultAreaStyle('Transparent gefüllt'),
    createDefaultAreaStyle('Gestrichelte Umrandung', {
      fill: { enabled: false, color: '#2f6bff', opacity: 0.25 },
      outline: { enabled: true, color: '#2f6bff', widthPx: 2, dashed: true },
    }),
  ]
}

export function createDefaultArea(
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon,
  name: string,
  source: AreaObject['source'],
  styleId: string | null,
): AreaObject {
  return {
    id: generateId(),
    name,
    styleId,
    geometry,
    source,
    visible: true,
  }
}

export function createDefaultRoute(waypoints: RouteWaypoint[]): RouteObject {
  return {
    id: generateId(),
    waypoints,
    routingMode: 'osrm',
    geometry: null,
    osrmDurationSec: null,
    color: '#e6572f',
    widthPx: 4,
    visible: true,
    appear: { startSec: 1 }, // 1 = today's default (holdStartSec) resolved against the default camera below
    reveal: 'progressive',
    drawDurationSec: 3,
  }
}

export function createDefaultProject(): ProjectFile {
  return {
    version: PROJECT_VERSION,
    camera: {
      waypoints: [
        createDefaultCameraWaypoint(10, 51, 4, { holdSec: 1, travelSec: 0 }),
        createDefaultCameraWaypoint(10, 51, 10, { holdSec: 2, travelSec: 4 }),
      ],
    },
    style: {
      id: 'positron',
      labelDensity: 1,
      germanNames: true,
      hideMinorLabels: true,
    },
    markers: [],
    areas: [],
    areaStyles: createDefaultAreaStyles(),
    route: null,
    export: {
      resolution: { preset: '1920x1080', width: 1920, height: 1080 },
      fps: 30,
      format: 'mp4',
      quality: 0.35,
      showAttribution: true,
    },
  }
}
