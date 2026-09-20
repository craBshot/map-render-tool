import { useEffect, useState } from 'react'
import { useEditorStore } from '../../state/editorStore'
import { useProjectStore } from '../../state/store'
import { fmtNum, waypointLetter } from '../format'
import styles from './RouteWaypointMarkers.module.css'

interface Position {
  x: number
  y: number
  /** Captured alongside x/y in the same update() pass as the waypoint it came from — never
      re-derived by indexing into the live route.waypoints at render time, which (being a plain
      prop, not state) can already be a different length than this still-stale-for-one-frame
      positions array right after a waypoint is deleted, and index out of bounds. */
  holdSec: number
}

/**
 * Small black dots + letter labels at each route waypoint, so the (otherwise
 * unreadable lng/lat) list in RoutePanel can be matched up against actual
 * positions on the map. Pure DOM overlay — like Crosshair/Readout, this is
 * never part of the export canvas and needs no style-reload handling, since
 * it only depends on map.project(), not on any MapLibre layer.
 *
 * While in Route mode, the label also shows the waypoint's hold time —
 * decluttered away in other modes, where it isn't the thing being edited.
 */
export function RouteWaypointMarkers() {
  const route = useProjectStore((s) => s.project.route)
  const controller = useEditorStore((s) => s.controller)
  const locked = useEditorStore((s) => s.locked)
  const playing = useEditorStore((s) => s.playing)
  const dragPreview = useEditorStore((s) => s.dragPreview)
  const mode = useEditorStore((s) => s.pointInteractionMode)
  const [positions, setPositions] = useState<Position[]>([])

  useEffect(() => {
    if (!controller || !route) {
      setPositions([])
      return
    }

    const update = () => {
      setPositions(
        route.waypoints.map((w) => {
          const live = dragPreview?.kind === 'route' && dragPreview.id === w.id ? dragPreview : w
          const { x, y } = controller.map.project([live.lng, live.lat])
          return { x, y, holdSec: w.holdSec }
        }),
      )
    }
    update()
    controller.map.on('move', update)
    controller.map.on('resize', update)
    return () => {
      controller.map.off('move', update)
      controller.map.off('resize', update)
    }
  }, [controller, route, dragPreview])

  if (!route || locked || playing) return null

  return (
    <>
      {positions.map((pos, index) => (
        <div key={index} className={styles.waypoint} style={{ left: pos.x, top: pos.y }}>
          <span className={styles.dot} />
          <span className={styles.label} data-testid={`route-waypoint-label-${index}`}>
            {mode === 'route' ? `${waypointLetter(index)} · ${fmtNum(pos.holdSec, 1)}s` : waypointLetter(index)}
          </span>
        </div>
      ))}
    </>
  )
}
