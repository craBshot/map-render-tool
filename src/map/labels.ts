import type { LayerSpecification, Map as MapLibreMap } from 'maplibre-gl'
import type { StyleState } from '../state/types'

const MINOR_LAYERS = ['transportation_name', 'poi', 'aerodrome_label', 'mountain_peak', 'housenumber']

const DE_FIELD: SymbolLayout['text-field'] = ['coalesce', ['get', 'name:de'], ['get', 'name:latin'], ['get', 'name']]

type SymbolLayout = NonNullable<Extract<LayerSpecification, { type: 'symbol' }>['layout']>

export interface OriginalLayerInfo {
  visibility: NonNullable<SymbolLayout['visibility']>
  textField: SymbolLayout['text-field']
}

/** Category rank used for the label-density slider: lower shows first. */
export function placeCategory(layer: LayerSpecification): number {
  const id = layer.id.toLowerCase()
  if (/country|state|continent/.test(id)) return -1
  if (id.includes('capital')) return 0
  if (/village|hamlet|suburb|neighbourhood|quarter|other|island|locality/.test(id)) return 3
  if (id.includes('town')) return 2
  if (id.includes('city')) return 1
  const filter = 'filter' in layer ? layer.filter : undefined
  const f = JSON.stringify(filter ?? '').toLowerCase()
  if (/"(village|hamlet|suburb|neighbourhood)"/.test(f)) return 3
  if (f.includes('"town"')) return 2
  if (f.includes('"city"')) return 1
  return 3
}

/**
 * Snapshot each symbol layer's original visibility/text-field. Must be
 * re-run after every style.load — setStyle(diff:false) wipes prior state.
 */
export function captureOriginalLayers(map: MapLibreMap): Record<string, OriginalLayerInfo> {
  const originals: Record<string, OriginalLayerInfo> = {}
  const style = map.getStyle()
  if (!style) return originals
  for (const layer of style.layers) {
    if (layer.type !== 'symbol') continue
    originals[layer.id] = {
      visibility: layer.layout?.visibility ?? 'visible',
      textField: layer.layout?.['text-field'],
    }
  }
  return originals
}

export function applyLabelSettings(
  map: MapLibreMap,
  originals: Record<string, OriginalLayerInfo>,
  settings: StyleState,
): void {
  const style = map.getStyle()
  if (!style) return

  for (const layer of style.layers) {
    if (layer.type !== 'symbol' || !originals[layer.id]) continue
    const orig = originals[layer.id]
    const sourceLayer = layer['source-layer']

    if (sourceLayer === 'place') {
      const category = placeCategory(layer)
      const show = category <= settings.labelDensity && orig.visibility !== 'none'
      map.setLayoutProperty(layer.id, 'visibility', show ? 'visible' : 'none')
      if (orig.textField !== undefined) {
        map.setLayoutProperty(layer.id, 'text-field', settings.germanNames ? DE_FIELD : orig.textField)
      }
    } else if (sourceLayer && MINOR_LAYERS.includes(sourceLayer)) {
      map.setLayoutProperty(layer.id, 'visibility', settings.hideMinorLabels ? 'none' : orig.visibility)
    }

    // German-ify water/park/other name labels too, but not house numbers or refs.
    const textFieldJson = JSON.stringify(orig.textField ?? '')
    if (
      sourceLayer !== 'place' &&
      orig.textField !== undefined &&
      /name/.test(textFieldJson) &&
      !/housenumber|ref/.test(textFieldJson)
    ) {
      map.setLayoutProperty(layer.id, 'text-field', settings.germanNames ? DE_FIELD : orig.textField)
    }
  }
}
