import { useEditorStore } from '../../state/editorStore'
import styles from './Crosshair.module.css'

/** Pure DOM overlay — never part of the export canvas. */
export function Crosshair() {
  const visible = useEditorStore((s) => s.crosshairVisible)
  const locked = useEditorStore((s) => s.locked)
  const playing = useEditorStore((s) => s.playing)
  if (!visible || locked || playing) return null

  return (
    <div className={styles.crosshair}>
      <span className={`${styles.h} ${styles.l}`} />
      <span className={`${styles.h} ${styles.r}`} />
      <span className={`${styles.v} ${styles.t}`} />
      <span className={`${styles.v} ${styles.b}`} />
      <span className={styles.center} />
    </div>
  )
}
