import { useEditorStore } from '../../state/editorStore'
import { useProjectStore } from '../../state/store'
import { createDefaultProject } from '../../state/types'
import { strings } from '../../i18n'
import { CollapsibleSection } from './CollapsibleSection'
import styles from './panel.module.css'

export function ProjectPanel() {
  const setProject = useProjectStore((s) => s.setProject)
  const locked = useEditorStore((s) => s.locked)
  const t = strings.project

  function resetProject() {
    if (!window.confirm(t.resetConfirm)) return
    const defaults = createDefaultProject()
    setProject((p) => ({ ...p, camera: defaults.camera, markers: [], areas: [], routes: [] }))
    useEditorStore.getState().setSelectedObjectId(null)
    useEditorStore.getState().setPlaybackTimeSec(0)
  }

  return (
    <CollapsibleSection sectionKey="project" heading={t.heading}>
      <fieldset className={styles.fieldset} disabled={locked}>
        <div className={styles.btns}>
          <button type="button" className={styles.button} onClick={resetProject}>
            {t.reset}
          </button>
        </div>
        <p className={styles.hint}>{t.resetHint}</p>
      </fieldset>
    </CollapsibleSection>
  )
}
