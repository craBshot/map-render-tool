import { useEffect, useState } from 'react'
import { useEditorStore } from '../../state/editorStore'
import { useProjectStore } from '../../state/store'
import { fmtNum, waypointLetter } from '../format'
import styles from './RouteWaypointMarkers.module.css'

interface Position {
  x: number
  y: number
  routeIndex: number
  index: number
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
 * With more than one route, letters get the route's number as prefix (2A, 2B …).
 */
export function RouteWaypointMarkers() {
  const routes = useProjectStore((s) => s.project.routes)
  const controller = useEditorStore((s) => s.controller)
  const locked = useEditorStore((s) => s.locked)
  const playing = useEditorStore((s) => s.playing)
  const dragPreview = useEditorStore((s) => s.dragPreview)
  const mode = useEditorStore((s) => s.pointInteractionMode)
  const [positions, setPositions] = useState<Position[]>([])

  useEffect(() => {
    if (!controller) {
      setPositions([])
      return
    }

    const update = () => {
      setPositions(
        routes.flatMap((route, routeIndex) =>
          route.waypoints.map((w, index) => {
            const live = dragPreview?.kind === 'route' && dragPreview.id === w.id ? dragPreview : w
            const { x, y } = controller.map.project([live.lng, live.lat])
            return { x, y, routeIndex, index, holdSec: w.holdSec }
          }),
        ),
      )
    }
    update()
    controller.map.on('move', update)
    controller.map.on('resize', update)
    return () => {
      controller.map.off('move', update)
      controller.map.off('resize', update)
    }
  }, [controller, routes, dragPreview])

  if (locked || playing) return null

  const prefixed = routes.length > 1
  return (
    <>
      {positions.map((pos) => {
        const letter = `${prefixed ? pos.routeIndex + 1 : ''}${waypointLetter(pos.index)}`
        return (
          <div key={`${pos.routeIndex}-${pos.index}`} className={styles.waypoint} style={{ left: pos.x, top: pos.y }}>
            <span className={styles.dot} />
            <span className={styles.label} data-testid={`route-waypoint-label-${pos.routeIndex}-${pos.index}`}>
              {mode === 'route' ? `${letter} · ${fmtNum(pos.holdSec, 1)}s` : letter}
            </span>
          </div>
        )
      })}
    </>
  )
}
