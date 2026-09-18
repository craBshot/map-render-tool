import { areaStateAt } from '../map/areaAnimation'
import { camAt } from '../map/camera'
import { drawAttribution } from '../map/attribution'
import type { MapController, RenderedArea, RenderedMarker, RenderedRoute } from '../map/MapController'
import { markerStateAt } from '../map/markerAnimation'
import { routeStateAt } from '../map/routeAnimation'
import { resolveAreaStyle, type ProjectFile } from '../state/types'
import { timingTotals } from '../timeline/timing'
import { createImageSequenceSink } from './imageSequenceSink'
import { createMp4Sink } from './mp4Sink'

export class ExportCancelledError extends Error {
  constructor() {
    super('Export abgebrochen.')
    this.name = 'ExportCancelledError'
  }
}

export interface ExportResult {
  blob: Blob
  ext: string
  totalFrames: number
}

export interface RunExportOptions {
  controller: MapController
  project: ProjectFile
  onProgress?: (message: string) => void
  isCancelled: () => boolean
}

/**
 * Renders the project deterministically, frame by frame: jumpTo the exact
 * camera/marker/area/route state for that frame, wait for idle, then read
 * the canvas. Never records a real-time animation. Preview and export share
 * the same camAt()/markerStateAt()/areaStateAt()/routeStateAt() +
 * MapController rendering as the editor's static view — only the driving
 * time source differs.
 */
export async function runExport({ controller, project, onProgress, isCancelled }: RunExportOptions): Promise<ExportResult> {
  const { width, height } = project.export.resolution
  const fps = project.export.fps
  const totals = timingTotals(project.camera.timing)
  const n0 = Math.round(totals.holdStartSec * fps)
  const nMove = Math.max(2, Math.round(totals.zoomDurationSec * fps))
  const n1 = Math.round(totals.holdEndSec * fps)
  const totalFrames = n0 + nMove + n1

  const outCanvas = document.createElement('canvas')
  outCanvas.width = width
  outCanvas.height = height
  const ctx = outCanvas.getContext('2d')
  if (!ctx) throw new Error('2D canvas context unavailable')

  const sink =
    project.export.format === 'mp4'
      ? await createMp4Sink(width, height, fps, project.export.quality)
      : await createImageSequenceSink(project.export.format)

  const cssWidth = controller.map.getContainer().clientWidth
  let ok = false
  let lastKey: string | null = null
  let areasOrdered = false

  try {
    controller.setPixelRatio(width / cssWidth)

    for (let i = 0; i < totalFrames; i++) {
      if (isCancelled()) throw new ExportCancelledError()

      const t = i < n0 ? 0 : i < n0 + nMove ? (i - n0) / (nMove - 1) : 1
      const sec = i / fps
      const markers: RenderedMarker[] = project.markers.map((marker) => ({
        marker,
        frame: markerStateAt(marker, totals, sec),
      }))
      const areas: RenderedArea[] = project.areas.map((area) => {
        const style = resolveAreaStyle(area.styleId, project.areaStyles)
        return { area, style, frame: areaStateAt(style, totals, sec) }
      })
      const route: RenderedRoute | null = project.route
        ? { route: project.route, frame: routeStateAt(project.route, totals, sec) }
        : null
      const key = `${t}|${JSON.stringify(markers.map((m) => m.frame))}|${JSON.stringify(areas.map((a) => a.frame))}|${JSON.stringify(route?.frame)}`
      const changed = key !== lastKey

      if (changed) {
        controller.applyCameraFrame(camAt(project.camera, t))
        controller.renderAreas(areas)
        controller.renderRoute(route)
        controller.renderMarkers(markers)
        if (!areasOrdered) {
          controller.reorderAreaLayers(project.areas.map((a) => a.id))
          areasOrdered = true
        }
        await controller.waitIdle()
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, width, height)
        ctx.drawImage(controller.map.getCanvas(), 0, 0, width, height)
        if (project.export.showAttribution) drawAttribution(ctx, width, height)
      }

      await sink.add(outCanvas, i, changed)
      lastKey = key
      onProgress?.(`Bild ${i + 1} von ${totalFrames} gerendert`)
    }

    const { blob, ext } = await sink.finish(onProgress)
    ok = true
    return { blob, ext, totalFrames }
  } finally {
    if (!ok) sink.abort()
    controller.setPixelRatio(window.devicePixelRatio || 1)
  }
}
