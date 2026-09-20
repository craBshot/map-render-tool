import { useEditorStore } from '../../state/editorStore'
import { strings } from '../../i18n'
import { AreaListPanel } from './AreaListPanel'
import { AreaStylePanel } from './AreaStylePanel'
import { AreaTypeSettingsPanel } from './AreaTypeSettingsPanel'
import { CameraPanel } from './CameraPanel'
import { ExportPanel } from './ExportPanel'
import { InteractionModePanel } from './InteractionModePanel'
import { MarkerPanel } from './MarkerPanel'
import { ProjectPanel } from './ProjectPanel'
import { RoutePanel } from './RoutePanel'
import { SearchPanel } from './SearchPanel'
import { StylePanel } from './StylePanel'
import styles from './Sidebar.module.css'

export function Sidebar() {
  const mode = useEditorStore((s) => s.pointInteractionMode)

  return (
    <aside className={styles.aside}>
      <h1 className={styles.title}>{strings.app.title}</h1>
      <p className={styles.lede}>{strings.app.lede}</p>
      <InteractionModePanel />

      {/* Only the panel(s) for the currently active mode — tinted with that mode's color
          (see index.css's --mode-* tokens) so the active mode reads at a glance. */}
      <div className={styles.modeSection} data-mode={mode}>
        {mode === 'marker' && <MarkerPanel />}
        {mode === 'route' && <RoutePanel />}
        {mode === 'camera' && <CameraPanel />}
        {mode === 'area' && (
          <>
            <AreaListPanel />
            <AreaStylePanel />
            <AreaTypeSettingsPanel />
          </>
        )}
      </div>

      {/* Always relevant regardless of mode. */}
      <div>
        <SearchPanel />
        <StylePanel />
        <ExportPanel />
        <ProjectPanel />
      </div>
    </aside>
  )
}
