import { downloadBlob } from '../export/download'
import { camAt } from '../map/camera'
import { strings } from '../i18n'
import { useEditorStore } from '../state/editorStore'
import { parseProjectFile, ProjectFileError, projectFileName, serializeProjectFile } from '../state/projectFile'
import { useProjectStore } from '../state/store'

/** Downloads the current project as <name>.maprender.json. */
export function saveProjectFile(): void {
  const project = useProjectStore.getState().project
  const fileName = projectFileName(project.name, strings.project.untitledFileName)
  downloadBlob(new Blob([serializeProjectFile(project, __APP_VERSION__)], { type: 'application/json' }), fileName)
  useEditorStore.getState().setProjectFileMessage({ text: strings.project.saved(fileName), isError: false })
}

/** Opens a saved project (file picker or drag & drop), replacing the current one as one undoable step. */
export async function openProjectFile(file: File): Promise<void> {
  const editor = useEditorStore.getState()
  const t = strings.project
  let text: string
  try {
    text = await file.text()
  } catch {
    editor.setProjectFileMessage({ text: t.errors.readFailed, isError: true })
    return
  }
  try {
    const project = parseProjectFile(text)
    useProjectStore.getState().replaceProject(project)
    editor.setSelectedObjectId(null)
    editor.setPlaybackTimeSec(0)
    editor.controller?.applyCameraFrame(camAt(project.camera, 0))
    editor.setProjectFileMessage({ text: t.opened(file.name), isError: false })
  } catch (err) {
    const kind = err instanceof ProjectFileError ? err.kind : 'notProjectFile'
    editor.setProjectFileMessage({ text: t.errors[kind], isError: true })
  }
}
