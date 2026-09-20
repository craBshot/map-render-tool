import { camStaticAt } from '../../map/camera'
import { useEditorStore } from '../../state/editorStore'
import { useProjectStore } from '../../state/store'
import { createDefaultCameraWaypoint, type CameraWaypoint } from '../../state/types'
import { strings } from '../../i18n'
import { describePoint, waypointLetter } from '../format'
import { CollapsibleSection } from './CollapsibleSection'
import styles from './panel.module.css'

export function CameraPanel() {
  const waypoints = useProjectStore((s) => s.project.camera.waypoints)
  const setProject = useProjectStore((s) => s.setProject)
  const locked = useEditorStore((s) => s.locked)
  const t = strings.camera

  function updateWaypoint(id: string, fn: (wp: CameraWaypoint) => CameraWaypoint) {
    setProject((p) => ({
      ...p,
      camera: { ...p.camera, waypoints: p.camera.waypoints.map((wp) => (wp.id === id ? fn(wp) : wp)) },
    }))
  }

  function moveWaypoint(index: number, direction: -1 | 1) {
    setProject((p) => {
      const target = index + direction
      if (target < 0 || target >= p.camera.waypoints.length) return p
      const next = p.camera.waypoints.slice()
      ;[next[index], next[target]] = [next[target], next[index]]
      return { ...p, camera: { ...p.camera, waypoints: next } }
    })
  }

  function deleteWaypoint(id: string) {
    setProject((p) => {
      if (p.camera.waypoints.length <= 2) return p
      return { ...p, camera: { ...p.camera, waypoints: p.camera.waypoints.filter((wp) => wp.id !== id) } }
    })
  }

  function addWaypoint() {
    const controller = useEditorStore.getState().controller
    const c = controller?.map.getCenter()
    const zr = controller ? controller.toRef(controller.map.getZoom()) : 4
    const last = waypoints[waypoints.length - 1]
    const lng = c?.lng ?? last?.lng ?? 0
    const lat = c?.lat ?? last?.lat ?? 0
    setProject((p) => ({
      ...p,
      camera: { ...p.camera, waypoints: [...p.camera.waypoints, createDefaultCameraWaypoint(lng, lat, zr)] },
    }))
  }

  function captureCurrentView(id: string) {
    const controller = useEditorStore.getState().controller
    if (!controller) return
    const c = controller.map.getCenter()
    const zr = controller.toRef(controller.map.getZoom())
    updateWaypoint(id, (wp) => ({ ...wp, lng: c.lng, lat: c.lat, zr }))
  }

  function showWaypoint(wp: CameraWaypoint) {
    const controller = useEditorStore.getState().controller
    if (!controller) return
    controller.applyCameraFrame(camStaticAt(wp))
  }

  return (
    <CollapsibleSection sectionKey="camera" heading={t.heading}>
      <fieldset className={styles.fieldset} disabled={locked}>
        <p className={styles.hint}>{t.pickHint}</p>

        {waypoints.map((wp, index) => (
          <div key={wp.id} className={styles.card} data-testid={`camera-waypoint-${index}`}>
            <div className={styles.cardHeader}>
              <span>{waypointLetter(index)}</span>
              <div className={styles.btns}>
                <button
                  type="button"
                  className={styles.iconButton}
                  onClick={() => moveWaypoint(index, -1)}
                  disabled={index === 0}
                  title={t.moveUp}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className={styles.iconButton}
                  onClick={() => moveWaypoint(index, 1)}
                  disabled={index === waypoints.length - 1}
                  title={t.moveDown}
                >
                  ↓
                </button>
                <button
                  type="button"
                  className={styles.iconButton}
                  onClick={() => deleteWaypoint(wp.id)}
                  disabled={waypoints.length <= 2}
                  title={t.deleteWaypoint}
                >
                  ✕
                </button>
              </div>
            </div>

            <div className={styles.coords}>{describePoint(wp.lng, wp.lat, wp.zr)}</div>

            <div className={styles.btns}>
              <button type="button" className={styles.button} onClick={() => captureCurrentView(wp.id)}>
                {t.captureCurrentView}
              </button>
              <button type="button" className={styles.button} onClick={() => showWaypoint(wp)}>
                {t.show}
              </button>
            </div>

            <div className={styles.row}>
              {index > 0 && (
                <div>
                  <label className={styles.label} htmlFor={`camTravel-${wp.id}`}>
                    {t.travelSec}
                  </label>
                  <input
                    id={`camTravel-${wp.id}`}
                    type="number"
                    className={styles.input}
                    min={0.5}
                    step={0.5}
                    value={wp.travelSec}
                    onChange={(e) => updateWaypoint(wp.id, (w) => ({ ...w, travelSec: Math.max(0.5, Number(e.target.value)) }))}
                  />
                </div>
              )}
              <div>
                <label className={styles.label} htmlFor={`camHold-${wp.id}`}>
                  {t.holdSec}
                </label>
                <input
                  id={`camHold-${wp.id}`}
                  type="number"
                  className={styles.input}
                  min={0}
                  step={0.5}
                  value={wp.holdSec}
                  onChange={(e) => updateWaypoint(wp.id, (w) => ({ ...w, holdSec: Math.max(0, Number(e.target.value)) }))}
                />
              </div>
            </div>
          </div>
        ))}

        <div className={styles.btns}>
          <button type="button" className={styles.button} onClick={addWaypoint}>
            {t.addWaypoint}
          </button>
        </div>
      </fieldset>
    </CollapsibleSection>
  )
}
