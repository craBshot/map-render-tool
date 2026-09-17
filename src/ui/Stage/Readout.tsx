import { useEditorStore } from '../../state/editorStore'
import styles from './Readout.module.css'

function fmtNum(n: number, decimals: number): string {
  return n.toFixed(decimals).replace('.', ',')
}

function describe(lng: number, lat: number, zr: number): string {
  const ns = lat >= 0 ? 'N' : 'S'
  const ew = lng >= 0 ? 'O' : 'W'
  return `${fmtNum(Math.abs(lat), 4)} ${ns}, ${fmtNum(Math.abs(lng), 4)} ${ew}, Zoom ${fmtNum(zr, 1)}`
}

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

  return <div className={styles.readout}>{describe(lng, lat, zr)}</div>
}
