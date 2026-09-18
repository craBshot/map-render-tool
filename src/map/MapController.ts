import maplibregl from 'maplibre-gl'
import type { AreaFrame } from './areaAnimation'
import type { CameraFrame } from './camera'
import { applyLabelSettings, captureOriginalLayers, type OriginalLayerInfo } from './labels'
import type { MarkerFrame } from './markerAnimation'
import { sliceLineByFraction } from './routeGeometry'
import type { RouteFrame } from './routeAnimation'
import type { AreaObject, AreaStyle, MarkerObject, RouteObject, StyleId, StyleState } from '../state/types'

export const STYLE_URLS: Record<StyleId, string> = {
  positron: 'https://tiles.openfreemap.org/styles/positron',
  liberty: 'https://tiles.openfreemap.org/styles/liberty',
  bright: 'https://tiles.openfreemap.org/styles/bright',
  dark: 'https://tiles.openfreemap.org/styles/dark',
  fiord: 'https://tiles.openfreemap.org/styles/fiord',
}

/** Zoom values are stored normalized to this reference width (zr). */
const REF_W = 1000

const GERMAN_LOCALE = {
  'NavigationControl.ZoomIn': 'Hineinzoomen',
  'NavigationControl.ZoomOut': 'Herauszoomen',
  'NavigationControl.ResetBearing': 'Ausrichtung zurücksetzen',
  'ScrollZoomBlocker.CtrlMessage': 'Strg + Scrollen zum Zoomen',
  'TouchPanBlocker.Message': 'Zwei Finger zum Verschieben',
}

export interface RenderedMarker {
  marker: MarkerObject
  frame: MarkerFrame
}

export interface RenderedArea {
  area: AreaObject
  style: AreaStyle | null
  frame: AreaFrame
}

export interface RenderedRoute {
  route: RouteObject
  frame: RouteFrame
}

export interface MapControllerOptions {
  container: HTMLElement
  style: StyleState
  /** Fires after every style (re)load, once labels/markers are safe to touch again. */
  onStyleReady?: () => void
}

/**
 * Thin wrapper around a maplibregl.Map carrying all the side-effecting,
 * viewport-dependent logic (style/label handling, camera application,
 * marker rendering, resizing). Everything here is deliberately impure —
 * the pure math lives in camera.ts/markerAnimation.ts.
 */
export class MapController {
  readonly map: maplibregl.Map
  private originalLayers: Record<string, OriginalLayerInfo> = {}
  private labelSettings: StyleState
  private styleReady = false

  constructor(options: MapControllerOptions) {
    this.labelSettings = options.style

    this.map = new maplibregl.Map({
      container: options.container,
      style: STYLE_URLS[options.style.id],
      center: [0, 0],
      zoom: 0,
      // Required so the export canvas can read back WebGL pixels.
      preserveDrawingBuffer: true,
      // Otherwise labels are half-faded in captured frames.
      fadeDuration: 0,
      attributionControl: false,
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
      maxPitch: 0,
      locale: GERMAN_LOCALE,
    })
    this.map.touchZoomRotate.disableRotation()
    this.map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')

    this.map.on('style.load', () => {
      this.styleReady = true
      this.originalLayers = captureOriginalLayers(this.map)
      applyLabelSettings(this.map, this.originalLayers, this.labelSettings)
      options.onStyleReady?.()
    })
  }

  /** Forces a full style reload — with diff:true, style.load never fires and marker/label settings get lost. */
  setStyle(styleId: StyleId): void {
    this.styleReady = false
    this.map.setStyle(STYLE_URLS[styleId], { diff: false })
  }

  setLabelSettings(settings: StyleState): void {
    this.labelSettings = settings
    applyLabelSettings(this.map, this.originalLayers, settings)
  }

  private zoomOffset(): number {
    return Math.log2(Math.max(1, this.map.getContainer().clientWidth) / REF_W)
  }

  toZoom(zr: number): number {
    return zr + this.zoomOffset()
  }

  toRef(zoom: number): number {
    return zoom - this.zoomOffset()
  }

  applyCameraFrame(cameraFrame: CameraFrame): void {
    this.map.jumpTo({
      center: cameraFrame.center,
      zoom: this.toZoom(cameraFrame.zr),
      bearing: cameraFrame.bearing,
      pitch: cameraFrame.pitch,
    })
  }

  renderMarkers(markers: RenderedMarker[]): void {
    for (const { marker, frame } of markers) this.renderMarker(marker, frame)
  }

  renderAreas(areas: RenderedArea[]): void {
    for (const { area, style, frame } of areas) this.renderArea(area, style, frame)
  }

  /** Finds the first marker layer, if any, so new area layers can be inserted below it. */
  private firstMarkerLayerId(): string | undefined {
    return this.map.getStyle()?.layers.find((l) => l.id.endsWith('-halo') && l.id.startsWith('marker-'))?.id
  }

  /** Reorders area layer pairs to match orderedIds (list order = stacking order), always below markers. */
  reorderAreaLayers(orderedIds: string[]): void {
    if (!this.styleReady) return
    const anchor = this.firstMarkerLayerId()
    // Walk bottom-to-top so each moveLayer (which inserts just before anchor)
    // leaves the top-of-list item closest to the anchor.
    for (let i = orderedIds.length - 1; i >= 0; i--) {
      const sourceId = `area-${orderedIds[i]}`
      if (!this.map.getSource(sourceId)) continue
      this.map.moveLayer(`${sourceId}-fill`, anchor)
      this.map.moveLayer(`${sourceId}-line`, anchor)
    }
  }

  /**
   * Applies a precomputed camera + marker + area + route frame together —
   * the one path playback and export both go through. Free editing (camera
   * driven by the user's own pan/zoom) calls applyCameraFrame()/
   * renderMarkers()/renderAreas()/renderRoute() separately instead, so
   * editing an object doesn't snap the camera back. Areas render before the
   * route, which renders before markers, so the target marker is never
   * obscured.
   */
  applyFrame(
    cameraFrame: CameraFrame,
    markers: RenderedMarker[],
    areas: RenderedArea[] = [],
    route: RenderedRoute | null = null,
  ): void {
    this.applyCameraFrame(cameraFrame)
    this.renderAreas(areas)
    this.renderRoute(route)
    this.renderMarkers(markers)
  }

  private renderMarker(marker: MarkerObject, frame: MarkerFrame): void {
    if (!this.styleReady) return
    const sourceId = `marker-${marker.id}`
    const haloLayerId = `${sourceId}-halo`
    const dotLayerId = `${sourceId}-dot`
    const data = {
      type: 'Feature' as const,
      properties: {},
      geometry: { type: 'Point' as const, coordinates: [marker.lng, marker.lat] },
    }

    const source = this.map.getSource(sourceId) as maplibregl.GeoJSONSource | undefined
    if (!source) {
      this.map.addSource(sourceId, { type: 'geojson', data })
      this.map.addLayer({
        id: haloLayerId,
        type: 'circle',
        source: sourceId,
        paint: { 'circle-pitch-alignment': 'map', 'circle-blur': 0.15 },
      })
      this.map.addLayer({
        id: dotLayerId,
        type: 'circle',
        source: sourceId,
        paint: { 'circle-stroke-color': '#ffffff' },
      })
    } else {
      source.setData(data)
    }

    const visibility = frame.visible ? 'visible' : 'none'
    this.map.setLayoutProperty(haloLayerId, 'visibility', visibility)
    this.map.setLayoutProperty(dotLayerId, 'visibility', visibility)
    if (!frame.visible) return

    this.map.setPaintProperty(haloLayerId, 'circle-color', marker.color)
    this.map.setPaintProperty(haloLayerId, 'circle-radius', frame.haloRadius)
    this.map.setPaintProperty(haloLayerId, 'circle-opacity', frame.haloOpacity)
    this.map.setPaintProperty(dotLayerId, 'circle-color', marker.color)
    this.map.setPaintProperty(dotLayerId, 'circle-radius', frame.radius)
    this.map.setPaintProperty(dotLayerId, 'circle-opacity', frame.opacity)
    this.map.setPaintProperty(dotLayerId, 'circle-stroke-width', frame.radius > 0 ? Math.max(1.5, marker.sizePx * 0.22) : 0)
    this.map.setPaintProperty(dotLayerId, 'circle-stroke-opacity', frame.opacity)
  }

  private renderArea(area: AreaObject, style: AreaStyle | null, frame: AreaFrame): void {
    if (!this.styleReady) return
    const sourceId = `area-${area.id}`
    const fillLayerId = `${sourceId}-fill`
    const lineLayerId = `${sourceId}-line`
    const data = { type: 'Feature' as const, properties: {}, geometry: area.geometry }

    const source = this.map.getSource(sourceId) as maplibregl.GeoJSONSource | undefined
    if (!source) {
      const beforeId = this.firstMarkerLayerId()
      this.map.addSource(sourceId, { type: 'geojson', data })
      this.map.addLayer({ id: fillLayerId, type: 'fill', source: sourceId, paint: {} }, beforeId)
      this.map.addLayer({ id: lineLayerId, type: 'line', source: sourceId, paint: {} }, beforeId)
    } else {
      source.setData(data)
    }

    const visible = frame.visible && area.visible && style !== null
    const visibility = visible ? 'visible' : 'none'
    this.map.setLayoutProperty(fillLayerId, 'visibility', visibility)
    this.map.setLayoutProperty(lineLayerId, 'visibility', visibility)
    if (!visible || !style) return

    this.map.setPaintProperty(fillLayerId, 'fill-color', style.fill.color)
    this.map.setPaintProperty(fillLayerId, 'fill-opacity', style.fill.enabled ? style.fill.opacity * frame.opacity : 0)
    this.map.setPaintProperty(lineLayerId, 'line-color', style.outline.color)
    this.map.setPaintProperty(lineLayerId, 'line-width', style.outline.enabled ? style.outline.widthPx : 0)
    this.map.setPaintProperty(lineLayerId, 'line-opacity', style.outline.enabled ? frame.opacity : 0)
    this.map.setPaintProperty(lineLayerId, 'line-dasharray', style.outline.dashed ? [2, 2] : undefined)
  }

  /** Route line — one per project (v1). Inserted below markers, above areas (renderAreas/renderRoute/renderMarkers order). */
  renderRoute(rendered: RenderedRoute | null): void {
    if (!this.styleReady) return
    const sourceId = 'route-line'
    const lineLayerId = `${sourceId}-layer`

    const visible = !!rendered && rendered.frame.visible && rendered.route.geometry !== null
    const source = this.map.getSource(sourceId) as maplibregl.GeoJSONSource | undefined

    if (!visible) {
      if (source) this.map.setLayoutProperty(lineLayerId, 'visibility', 'none')
      return
    }

    const route = rendered.route
    const coordinates = sliceLineByFraction(route.geometry!.coordinates, rendered.frame.fraction)
    const data = { type: 'Feature' as const, properties: {}, geometry: { type: 'LineString' as const, coordinates } }

    if (!source) {
      const beforeId = this.firstMarkerLayerId()
      this.map.addSource(sourceId, { type: 'geojson', data })
      this.map.addLayer(
        {
          id: lineLayerId,
          type: 'line',
          source: sourceId,
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: {},
        },
        beforeId,
      )
    } else {
      source.setData(data)
    }

    this.map.setLayoutProperty(lineLayerId, 'visibility', 'visible')
    this.map.setPaintProperty(lineLayerId, 'line-color', route.color)
    this.map.setPaintProperty(lineLayerId, 'line-width', route.widthPx)
  }

  /** Set export resolution via pixel ratio, not container size, so framing matches the preview. */
  setPixelRatio(ratio: number): void {
    this.map.setPixelRatio(ratio)
  }

  /** Sizes the map container to fit targetW/H inside the available stage box, preserving center/zoom. */
  fitStage(targetWidthPx: number, targetHeightPx: number, stageBox: { width: number; height: number }, padding = 28): void {
    const scale = Math.min(
      (stageBox.width - padding * 2) / targetWidthPx,
      (stageBox.height - padding * 2) / targetHeightPx,
    )
    const container = this.map.getContainer()
    const hadSize = container.clientWidth > 0
    const center = hadSize ? this.map.getCenter() : null
    const ref = hadSize ? this.toRef(this.map.getZoom()) : null

    container.style.width = `${Math.max(100, Math.floor(targetWidthPx * scale))}px`
    container.style.height = `${Math.max(60, Math.floor(targetHeightPx * scale))}px`
    this.map.resize()

    if (hadSize && center && ref !== null) {
      this.map.jumpTo({ center, zoom: this.toZoom(ref) })
    }
  }

  waitIdle(timeoutMs = 20000): Promise<void> {
    return new Promise((resolve) => {
      let done = false
      const finish = () => {
        if (done) return
        done = true
        clearTimeout(timer)
        resolve()
      }
      const timer = setTimeout(finish, timeoutMs)
      this.map.once('idle', finish)
      this.map.triggerRepaint()
    })
  }

  destroy(): void {
    this.map.remove()
  }
}
