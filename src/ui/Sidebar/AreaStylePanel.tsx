import { useEditorStore } from '../../state/editorStore'
import { useProjectStore } from '../../state/store'
import { createDefaultAreaStyle, type AreaStyle } from '../../state/types'
import { strings } from '../../i18n'
import styles from './panel.module.css'

const MAX_STYLES = 5

export function AreaStylePanel() {
  const areaStyles = useProjectStore((s) => s.project.areaStyles)
  const setProject = useProjectStore((s) => s.setProject)
  const locked = useEditorStore((s) => s.locked)
  const t = strings.areaStyle

  function updateStyle(id: string, fn: (style: AreaStyle) => AreaStyle) {
    setProject((p) => ({ ...p, areaStyles: p.areaStyles.map((s) => (s.id === id ? fn(s) : s)) }))
  }

  function addStyle() {
    setProject((p) => ({
      ...p,
      areaStyles: [...p.areaStyles, createDefaultAreaStyle(`${t.heading} ${p.areaStyles.length + 1}`)],
    }))
  }

  function deleteStyle(id: string) {
    setProject((p) => ({
      ...p,
      areaStyles: p.areaStyles.filter((s) => s.id !== id),
      // Areas using the deleted style fall back to "none" rather than dangling.
      areas: p.areas.map((a) => (a.styleId === id ? { ...a, styleId: null } : a)),
    }))
  }

  return (
    <details className={styles.section} open>
      <summary className={styles.heading}>{t.heading}</summary>
      <fieldset className={styles.fieldset} disabled={locked}>
        {areaStyles.map((style) => (
          <div key={style.id} className={styles.card}>
            <div className={styles.cardHeader}>
              <input
                type="text"
                className={styles.input}
                value={style.name}
                onChange={(e) => updateStyle(style.id, (s) => ({ ...s, name: e.target.value }))}
              />
              <button type="button" className={styles.iconButton} onClick={() => deleteStyle(style.id)} title={t.deleteStyle}>
                ✕
              </button>
            </div>

            <label className={styles.check}>
              <input
                type="checkbox"
                checked={style.fill.enabled}
                onChange={(e) => updateStyle(style.id, (s) => ({ ...s, fill: { ...s.fill, enabled: e.target.checked } }))}
              />
              {t.fill}
            </label>
            {style.fill.enabled && (
              <div className={styles.row}>
                <div>
                  <label className={styles.label}>{t.fillColor}</label>
                  <input
                    type="color"
                    className={styles.colorInput}
                    value={style.fill.color}
                    onChange={(e) => updateStyle(style.id, (s) => ({ ...s, fill: { ...s.fill, color: e.target.value } }))}
                  />
                </div>
                <div>
                  <label className={styles.label}>{t.fillOpacity}</label>
                  <input
                    type="number"
                    className={styles.input}
                    min={0}
                    max={1}
                    step={0.05}
                    value={style.fill.opacity}
                    onChange={(e) =>
                      updateStyle(style.id, (s) => ({
                        ...s,
                        fill: { ...s.fill, opacity: Math.min(1, Math.max(0, Number(e.target.value))) },
                      }))
                    }
                  />
                </div>
              </div>
            )}

            <label className={styles.check}>
              <input
                type="checkbox"
                checked={style.outline.enabled}
                onChange={(e) =>
                  updateStyle(style.id, (s) => ({ ...s, outline: { ...s.outline, enabled: e.target.checked } }))
                }
              />
              {t.outline}
            </label>
            {style.outline.enabled && (
              <>
                <div className={styles.row}>
                  <div>
                    <label className={styles.label}>{t.outlineColor}</label>
                    <input
                      type="color"
                      className={styles.colorInput}
                      value={style.outline.color}
                      onChange={(e) =>
                        updateStyle(style.id, (s) => ({ ...s, outline: { ...s.outline, color: e.target.value } }))
                      }
                    />
                  </div>
                  <div>
                    <label className={styles.label}>{t.outlineWidth}</label>
                    <input
                      type="number"
                      className={styles.input}
                      min={1}
                      step={0.5}
                      value={style.outline.widthPx}
                      onChange={(e) =>
                        updateStyle(style.id, (s) => ({
                          ...s,
                          outline: { ...s.outline, widthPx: Math.max(1, Number(e.target.value)) },
                        }))
                      }
                    />
                  </div>
                </div>
                <label className={styles.check}>
                  <input
                    type="checkbox"
                    checked={style.outline.dashed}
                    onChange={(e) =>
                      updateStyle(style.id, (s) => ({ ...s, outline: { ...s.outline, dashed: e.target.checked } }))
                    }
                  />
                  {t.outlineDashed}
                </label>
              </>
            )}

          </div>
        ))}

        <div className={styles.btns}>
          <button type="button" className={styles.button} onClick={addStyle} disabled={areaStyles.length >= MAX_STYLES}>
            {t.addStyle}
          </button>
        </div>
      </fieldset>
    </details>
  )
}
