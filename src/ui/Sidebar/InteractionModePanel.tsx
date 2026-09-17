import { useEditorStore } from '../../state/editorStore'
import { strings } from '../../i18n'
import styles from './InteractionModePanel.module.css'

/** Switches what a right-click on the map does — set the marker, or query an area. */
export function InteractionModePanel() {
  const mode = useEditorStore((s) => s.pointInteractionMode)
  const locked = useEditorStore((s) => s.locked)
  const t = strings.interactionMode

  return (
    <div className={styles.switch} role="radiogroup">
      {(['marker', 'area'] as const).map((value) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={mode === value}
          className={mode === value ? styles.active : styles.button}
          disabled={locked}
          onClick={() => useEditorStore.getState().setPointInteractionMode(value)}
        >
          {t[value]}
        </button>
      ))}
    </div>
  )
}
