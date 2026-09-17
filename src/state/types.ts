export const PROJECT_VERSION = 1

/**
 * crypto.randomUUID() requires a secure context, but this app must also
 * work over plain HTTP (CLAUDE.md) — so ids are generated without it.
 */
export function generateId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

export type StyleId = 'positron' | 'liberty' | 'bright' | 'dark' | 'fiord'

export type ExportFormat = 'mp4' | 'jpeg' | 'png'

export type ResolutionPreset = '1920x1080' | '3840x2160' | 'custom'

export interface CameraPoint {
  lng: number
  lat: number
  /** Zoom normalized to a 1000px reference width so window size/resolution don't change the framing. */
  zr: number
}

export interface CameraState {
  start: CameraPoint
  end: CameraPoint
  timing: {
    holdStartSec: number
    zoomDurationSec: number
    holdEndSec: number
  }
}

export interface StyleState {
  id: StyleId
  labelDensity: 0 | 1 | 2 | 3
  germanNames: boolean
  hideMinorLabels: boolean
}

export interface MarkerObject {
  id: string
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
  appear: {
    mode: 'start' | 'zoomStart' | 'zoomEnd' | 'custom'
    atSec?: number
    popDurationSec: number
  }
  visible: boolean
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
    appear: { mode: 'zoomEnd', popDurationSec: 0.6 },
    visible: true,
  }
}

export function createDefaultProject(): ProjectFile {
  return {
    version: PROJECT_VERSION,
    camera: {
      start: { lng: 10, lat: 51, zr: 4 },
      end: { lng: 10, lat: 51, zr: 10 },
      timing: { holdStartSec: 1, zoomDurationSec: 4, holdEndSec: 2 },
    },
    style: {
      id: 'positron',
      labelDensity: 2,
      germanNames: true,
      hideMinorLabels: false,
    },
    markers: [],
    export: {
      resolution: { preset: '1920x1080', width: 1920, height: 1080 },
      fps: 30,
      format: 'mp4',
      quality: 1,
      showAttribution: true,
    },
  }
}
