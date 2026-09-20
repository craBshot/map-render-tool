import { useEffect, useState } from 'react'
import { useEditorStore } from '../../state/editorStore'
import { useProjectStore } from '../../state/store'
import { fmtNum, waypointLetter } from '../format'
import styles from './CameraWaypointMarkers.module.css'

interface Position {
  x: number
  y: number
}

/**
 * Small dots + letter labels at each camera waypoint, so the CameraPanel
 * list can be matched up against actual positions on the map — direct
 * structural copy of RouteWaypointMarkers, same reasoning: pure DOM
 * overlay, never part of the export canvas, needs no style-reload
 * handling since it only depends on map.project(), not on any MapLibre
 * layer.
 *
 * While in Kameraflug mode, the label also shows zoom + hold time — the
 * two fields you'd otherwise have to open the sidebar to check, and the
 * whole point of planning a multi-waypoint flight without constantly
 * zooming the live view in and out to "peek" at each waypoint's own zoom.
 */
export function CameraWaypointMarkers() {
  const waypoints = useProjectStore((s) => s.project.camera.waypoints)
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
        waypoints.map((w) => {
          const live = dragPreview?.kind === 'camera' && dragPreview.id === w.id ? dragPreview : w
          return controller.map.project([live.lng, live.lat])
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
  }, [controller, waypoints, dragPreview])

  if (locked || playing) return null

  return (
    <>
      {positions.map((pos, index) => (
        <div key={index} className={styles.waypoint} style={{ left: pos.x, top: pos.y }}>
          <span className={styles.dot} />
          <span className={styles.label} data-testid={`camera-waypoint-label-${index}`}>
            {mode === 'camera'
              ? `${waypointLetter(index)} · Zoom ${fmtNum(waypoints[index].zr, 1)} · ${fmtNum(waypoints[index].holdSec, 1)}s`
              : waypointLetter(index)}
          </span>
        </div>
      ))}
    </>
  )
}
