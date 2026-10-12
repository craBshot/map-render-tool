import { useEffect } from 'react'
import { useEditorStore } from '../state/editorStore'
import { useProjectStore } from '../state/store'

/** Inputs where Ctrl+Z must stay the browser's own text undo. */
function isTextEntry(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true
  return target instanceof HTMLInputElement && !['checkbox', 'radio', 'button', 'range', 'color'].includes(target.type)
}

/**
 * Global project undo/redo: Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z, Ctrl/Cmd+Y. Every pointerdown also
 * closes the current undo step, so separate clicks never merge (see store.ts's COALESCE_MS).
 */
export function useUndoShortcuts(): void {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || isTextEntry(e.target)) return
      const key = e.key.toLowerCase()
      const isUndo = key === 'z' && !e.shiftKey
      const isRedo = (key === 'z' && e.shiftKey) || (key === 'y' && !e.shiftKey)
      if (!isUndo && !isRedo) return
      e.preventDefault()
      const editor = useEditorStore.getState()
      if (editor.locked || editor.playing) return
      if (isUndo) useProjectStore.getState().undo()
      else useProjectStore.getState().redo()
    }
    function onPointerDown() {
      useProjectStore.getState().breakUndoStep()
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('pointerdown', onPointerDown, true)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('pointerdown', onPointerDown, true)
    }
  }, [])
}
