import { strings } from '../../i18n'
import { AreaListPanel } from './AreaListPanel'
import { AreaStylePanel } from './AreaStylePanel'
import { AreaTypeSettingsPanel } from './AreaTypeSettingsPanel'
import { CameraPanel } from './CameraPanel'
import { ExportPanel } from './ExportPanel'
import { InteractionModePanel } from './InteractionModePanel'
import { MarkerPanel } from './MarkerPanel'
import { RoutePanel } from './RoutePanel'
import { SearchPanel } from './SearchPanel'
import { StylePanel } from './StylePanel'
import styles from './Sidebar.module.css'

export function Sidebar() {
  return (
    <aside className={styles.aside}>
      <h1 className={styles.title}>{strings.app.title}</h1>
      <p className={styles.lede}>{strings.app.lede}</p>
      <SearchPanel />
      <CameraPanel />
      <StylePanel />
      <InteractionModePanel />
      <MarkerPanel />
      <AreaListPanel />
      <AreaStylePanel />
      <RoutePanel />
      <ExportPanel />
      <AreaTypeSettingsPanel />
    </aside>
  )
}
