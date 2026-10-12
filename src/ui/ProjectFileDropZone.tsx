import { useEffect, useState } from 'react'
import { strings } from '../i18n'
import { useEditorStore } from '../state/editorStore'
import { openProjectFile } from './projectFileActions'
import styles from './ProjectFileDropZone.module.css'

function hasFiles(e: DragEvent): boolean {
  return !!e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files')
}

/** Dropping a project file anywhere on the window opens it; shows an overlay while a file is dragged over. */
export function ProjectFileDropZone() {
  const [active, setActive] = useState(false)

  useEffect(() => {
    // dragenter/dragleave fire for every child element crossed — count them to know when the
    // file actually left the window.
    let depth = 0
    function onDragEnter(e: DragEvent) {
      if (!hasFiles(e)) return
      depth++
      setActive(true)
    }
    function onDragLeave(e: DragEvent) {
      if (!hasFiles(e)) return
      depth = Math.max(0, depth - 1)
      if (depth === 0) setActive(false)
    }
    function onDragOver(e: DragEvent) {
      if (hasFiles(e)) e.preventDefault() // required, otherwise the browser opens the file itself
    }
    function onDrop(e: DragEvent) {
      if (!hasFiles(e)) return
      e.preventDefault()
      depth = 0
      setActive(false)
      const editor = useEditorStore.getState()
      const file = e.dataTransfer?.files[0]
      if (!file || editor.locked) return
      editor.setSidebarSectionOpen('project', true) // where the result message shows up
      void openProjectFile(file)
    }
    window.addEventListener('dragenter', onDragEnter)
    window.addEventListener('dragleave', onDragLeave)
    window.addEventListener('dragover', onDragOver)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('dragenter', onDragEnter)
      window.removeEventListener('dragleave', onDragLeave)
      window.removeEventListener('dragover', onDragOver)
      window.removeEventListener('drop', onDrop)
    }
  }, [])

  if (!active) return null
  return (
    <div className={styles.overlay} data-testid="project-drop-overlay">
      <div className={styles.label}>{strings.project.dropHint}</div>
    </div>
  )
}
