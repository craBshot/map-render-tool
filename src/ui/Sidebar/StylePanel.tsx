import { useEditorStore } from '../../state/editorStore'
import { useProjectStore } from '../../state/store'
import type { StyleId } from '../../state/types'
import { strings } from '../../i18n'
import styles from './panel.module.css'

const STYLE_IDS: StyleId[] = ['positron', 'liberty', 'bright', 'dark', 'fiord']

export function StylePanel() {
  const style = useProjectStore((s) => s.project.style)
  const setProject = useProjectStore((s) => s.setProject)
  const locked = useEditorStore((s) => s.locked)
  const t = strings.style

  function update<K extends keyof typeof style>(field: K, value: (typeof style)[K]) {
    setProject((p) => ({ ...p, style: { ...p.style, [field]: value } }))
  }

  return (
    <section className={styles.section}>
      <h2 className={styles.heading}>{t.heading}</h2>
      <fieldset className={styles.fieldset} disabled={locked}>
        <label className={styles.label} htmlFor="mapStyle">
          {t.mapStyle}
        </label>
        <select
          id="mapStyle"
          className={styles.select}
          value={style.id}
          onChange={(e) => update('id', e.target.value as StyleId)}
        >
          {STYLE_IDS.map((id) => (
            <option key={id} value={id}>
              {t.styles[id]}
            </option>
          ))}
        </select>

        <label className={styles.label} htmlFor="labelDensity">
          {t.labelDensity}
        </label>
        <select
          id="labelDensity"
          className={styles.select}
          value={style.labelDensity}
          onChange={(e) => update('labelDensity', Number(e.target.value) as 0 | 1 | 2 | 3)}
        >
          {t.densityLevels.map((label, level) => (
            <option key={level} value={level}>
              {label}
            </option>
          ))}
        </select>

        <label className={styles.check}>
          <input type="checkbox" checked={style.germanNames} onChange={(e) => update('germanNames', e.target.checked)} />
          {t.germanNames}
        </label>
        <label className={styles.check}>
          <input
            type="checkbox"
            checked={style.hideMinorLabels}
            onChange={(e) => update('hideMinorLabels', e.target.checked)}
          />
          {t.hideMinor}
        </label>
      </fieldset>
    </section>
  )
}
