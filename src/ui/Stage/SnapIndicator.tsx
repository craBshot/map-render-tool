import { useEffect, useState } from 'react'
import { useEditorStore } from '../../state/editorStore'
import styles from './SnapIndicator.module.css'

interface Position {
  x: number
  y: number
}

/**
 * Highlight ring shown at a drag/placement's snap target while dragPreview.snapped
 * is true — pure DOM overlay, like Crosshair/the two waypoint-dot overlays, never
 * part of the export canvas and needs no style-reload handling (no MapLibre layer).
 */
export function SnapIndicator() {
  const controller = useEditorStore((s) => s.controller)
  const locked = useEditorStore((s) => s.locked)
  const playing = useEditorStore((s) => s.playing)
  const dragPreview = useEditorStore((s) => s.dragPreview)
  const [position, setPosition] = useState<Position | null>(null)

  useEffect(() => {
    if (!controller || !dragPreview?.snapped) {
      setPosition(null)
      return
    }

    const update = () => setPosition(controller.map.project([dragPreview.lng, dragPreview.lat]))
    update()
    controller.map.on('move', update)
    controller.map.on('resize', update)
    return () => {
      controller.map.off('move', update)
      controller.map.off('resize', update)
    }
  }, [controller, dragPreview])

  if (locked || playing || !position) return null

  return (
    <div className={styles.snapIndicator} style={{ left: position.x, top: position.y }}>
      <span className={styles.ring} />
    </div>
  )
}
