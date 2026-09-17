import { useEditorStore } from '../../state/editorStore'
import { describePoint } from '../format'
import styles from './Readout.module.css'

interface ReadoutProps {
  lng: number
  lat: number
  zr: number
}

/** Pure DOM overlay — never part of the export canvas. */
export function Readout({ lng, lat, zr }: ReadoutProps) {
  const visible = useEditorStore((s) => s.crosshairVisible)
  const locked = useEditorStore((s) => s.locked)
  if (!visible || locked) return null

  return <div className={styles.readout}>{describePoint(lng, lat, zr)}</div>
}
