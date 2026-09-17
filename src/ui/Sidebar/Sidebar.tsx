import { strings } from '../../i18n'
import { CameraPanel } from './CameraPanel'
import { ExportPanel } from './ExportPanel'
import { MarkerPanel } from './MarkerPanel'
import { StylePanel } from './StylePanel'
import styles from './Sidebar.module.css'

export function Sidebar() {
  return (
    <aside className={styles.aside}>
      <h1 className={styles.title}>{strings.app.title}</h1>
      <p className={styles.lede}>{strings.app.lede}</p>
      <CameraPanel />
      <StylePanel />
      <MarkerPanel />
      <ExportPanel />
    </aside>
  )
}
