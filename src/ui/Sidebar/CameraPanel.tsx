import { camAt } from '../../map/camera'
import { useEditorStore } from '../../state/editorStore'
import { useProjectStore } from '../../state/store'
import type { CameraPoint } from '../../state/types'
import { strings } from '../../i18n'
import { describePoint } from '../format'
import styles from './panel.module.css'

type Which = 'start' | 'end'

export function CameraPanel() {
  const camera = useProjectStore((s) => s.project.camera)
  const setProject = useProjectStore((s) => s.setProject)
  const t = strings.camera

  function capture(which: Which) {
    const controller = useEditorStore.getState().controller
    if (!controller) return
    const c = controller.map.getCenter()
    const point: CameraPoint = { lng: c.lng, lat: c.lat, zr: controller.toRef(controller.map.getZoom()) }
    setProject((p) => ({ ...p, camera: { ...p.camera, [which]: point } }))
  }

  function show(which: Which) {
    const controller = useEditorStore.getState().controller
    if (!controller) return
    controller.applyCameraFrame(camAt(camera, which === 'start' ? 0 : 1))
  }

  function updateTiming(field: keyof typeof camera.timing, value: number) {
    setProject((p) => ({ ...p, camera: { ...p.camera, timing: { ...p.camera.timing, [field]: value } } }))
  }

  return (
    <section className={styles.section}>
      <h2 className={styles.heading}>{t.heading}</h2>

      {(['start', 'end'] as const).map((which) => (
        <div className={styles.point} key={which}>
          <span className={`${styles.pin} ${which === 'end' ? styles.pinEnd : ''}`} />
          <div>
            <strong>{t[which]}</strong>
            <div className={styles.coords}>{describePoint(camera[which].lng, camera[which].lat, camera[which].zr)}</div>
            <div className={styles.btns}>
              <button type="button" className={styles.button} onClick={() => capture(which)}>
                {t.captureCurrentView}
              </button>
              <button type="button" className={styles.button} onClick={() => show(which)}>
                {t.show}
              </button>
            </div>
          </div>
        </div>
      ))}

      <div className={styles.row3}>
        <div>
          <label className={styles.label} htmlFor="holdStart">
            {t.holdStart}
          </label>
          <input
            id="holdStart"
            type="number"
            className={styles.input}
            min={0}
            step={0.5}
            value={camera.timing.holdStartSec}
            onChange={(e) => updateTiming('holdStartSec', Number(e.target.value))}
          />
        </div>
        <div>
          <label className={styles.label} htmlFor="zoomDuration">
            {t.zoomDuration}
          </label>
          <input
            id="zoomDuration"
            type="number"
            className={styles.input}
            min={0.5}
            step={0.5}
            value={camera.timing.zoomDurationSec}
            onChange={(e) => updateTiming('zoomDurationSec', Number(e.target.value))}
          />
        </div>
        <div>
          <label className={styles.label} htmlFor="holdEnd">
            {t.holdEnd}
          </label>
          <input
            id="holdEnd"
            type="number"
            className={styles.input}
            min={0}
            step={0.5}
            value={camera.timing.holdEndSec}
            onChange={(e) => updateTiming('holdEndSec', Number(e.target.value))}
          />
        </div>
      </div>
    </section>
  )
}
