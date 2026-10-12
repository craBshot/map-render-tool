import { useRef } from 'react'
import { useEditorStore } from '../../state/editorStore'
import { useProjectStore } from '../../state/store'
import { createDefaultProject } from '../../state/types'
import { strings } from '../../i18n'
import { openProjectFile, saveProjectFile } from '../projectFileActions'
import { CollapsibleSection } from './CollapsibleSection'
import styles from './panel.module.css'

export function ProjectPanel() {
  const name = useProjectStore((s) => s.project.name)
  const setProject = useProjectStore((s) => s.setProject)
  const locked = useEditorStore((s) => s.locked)
  const message = useEditorStore((s) => s.projectFileMessage)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const t = strings.project

  function resetProject() {
    if (!window.confirm(t.resetConfirm)) return
    const defaults = createDefaultProject()
    setProject((p) => ({ ...p, name: '', camera: defaults.camera, markers: [], areas: [], routes: [] }))
    useEditorStore.getState().setSelectedObjectId(null)
    useEditorStore.getState().setPlaybackTimeSec(0)
    useEditorStore.getState().setProjectFileMessage(null)
  }

  return (
    <CollapsibleSection sectionKey="project" heading={t.heading}>
      <fieldset className={styles.fieldset} disabled={locked}>
        <label className={styles.label} htmlFor="projectName">
          {t.name}
        </label>
        <input
          id="projectName"
          type="text"
          className={styles.input}
          placeholder={t.namePlaceholder}
          value={name}
          onChange={(e) => setProject((p) => ({ ...p, name: e.target.value }))}
        />

        <div className={styles.btns} style={{ marginTop: 10 }}>
          <button type="button" className={styles.button} onClick={saveProjectFile}>
            {t.save}
          </button>
          <button type="button" className={styles.button} onClick={() => fileInputRef.current?.click()}>
            {t.open}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            hidden
            data-testid="project-file-input"
            onChange={(e) => {
              const file = e.target.files?.[0]
              e.target.value = '' // so picking the same file again still fires onChange
              if (file) void openProjectFile(file)
            }}
          />
        </div>
        <p className={styles.hint}>{t.fileHint}</p>
        {message && <p className={message.isError ? styles.msgErr : styles.msg}>{message.text}</p>}

        <div className={styles.btns} style={{ marginTop: 12 }}>
          <button type="button" className={styles.button} onClick={resetProject}>
            {t.reset}
          </button>
        </div>
        <p className={styles.hint}>{t.resetHint}</p>
      </fieldset>
    </CollapsibleSection>
  )
}
