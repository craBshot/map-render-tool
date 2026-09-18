import { useEffect, useState } from 'react'
import { useEditorStore } from '../../state/editorStore'
import { useProjectStore } from '../../state/store'
import { waypointLetter } from '../format'
import styles from './RouteWaypointMarkers.module.css'

interface Position {
  x: number
  y: number
}

/**
 * Small black dots + letter labels at each route waypoint, so the (otherwise
 * unreadable lng/lat) list in RoutePanel can be matched up against actual
 * positions on the map. Pure DOM overlay — like Crosshair/Readout, this is
 * never part of the export canvas and needs no style-reload handling, since
 * it only depends on map.project(), not on any MapLibre layer.
 */
export function RouteWaypointMarkers() {
  const route = useProjectStore((s) => s.project.route)
  const controller = useEditorStore((s) => s.controller)
  const locked = useEditorStore((s) => s.locked)
  const playing = useEditorStore((s) => s.playing)
  const [positions, setPositions] = useState<Position[]>([])

  useEffect(() => {
    if (!controller || !route) {
      setPositions([])
      return
    }

    const update = () => {
      setPositions(route.waypoints.map((w) => controller.map.project([w.lng, w.lat])))
    }
    update()
    controller.map.on('move', update)
    controller.map.on('resize', update)
    return () => {
      controller.map.off('move', update)
      controller.map.off('resize', update)
    }
  }, [controller, route])

  if (!route || locked || playing) return null

  return (
    <>
      {positions.map((pos, index) => (
        <div key={index} className={styles.waypoint} style={{ left: pos.x, top: pos.y }}>
          <span className={styles.dot} />
          <span className={styles.label}>{waypointLetter(index)}</span>
        </div>
      ))}
    </>
  )
}
