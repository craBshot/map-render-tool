import type { AreaCandidateTypeSettings } from '../../state/areaCandidateTypeSettings'
import { useSettingsStore } from '../../state/settingsStore'
import { strings } from '../../i18n'
import styles from './panel.module.css'

const KIND_KEYS: (keyof AreaCandidateTypeSettings)[] = [
  'administrative',
  'protected_area',
  'national_park',
  'nature_reserve',
  'postal_code',
  'political',
  'statistical',
  'religious_administration',
  'timezone',
  'public_transport',
  'other',
]

/** Tool preference (not project data) — which Overpass categories are even offered as candidates. */
export function AreaTypeSettingsPanel() {
  const enabled = useSettingsStore((s) => s.areaCandidateTypes)
  const t = strings.areaTypeSettings
  const kindLabels = strings.area.kinds

  return (
    <details className={styles.section} open>
      <summary className={styles.heading}>{t.heading}</summary>
      <p className={styles.hint}>{t.hint}</p>
      {KIND_KEYS.map((kind) => (
        <label key={kind} className={styles.check}>
          <input
            type="checkbox"
            checked={enabled[kind]}
            onChange={(e) => useSettingsStore.getState().setAreaCandidateTypeEnabled(kind, e.target.checked)}
          />
          {kindLabels[kind]}
        </label>
      ))}
    </details>
  )
}
