import { useEditorStore } from '../../state/editorStore'
import { useProjectStore } from '../../state/store'
import { createDefaultMarker, type MarkerObject } from '../../state/types'
import { strings } from '../../i18n'
import styles from './panel.module.css'

const APPEAR_MODES: MarkerObject['appear']['mode'][] = ['start', 'zoomStart', 'zoomEnd', 'custom']

export function MarkerPanel() {
  const markers = useProjectStore((s) => s.project.markers)
  const setProject = useProjectStore((s) => s.setProject)
  const locked = useEditorStore((s) => s.locked)
  const t = strings.marker
  const marker = markers[0]

  function update(fn: (m: MarkerObject) => MarkerObject) {
    setProject((p) => {
      const existing = p.markers[0] ?? createDefaultMarker(0, 0)
      const updated = fn(existing)
      return { ...p, markers: [updated, ...p.markers.slice(1)] }
    })
  }

  function setToMapCenter() {
    const controller = useEditorStore.getState().controller
    if (!controller) return
    const c = controller.map.getCenter()
    update((m) => ({ ...m, lng: c.lng, lat: c.lat, visible: true }))
  }

  return (
    <section className={styles.section}>
      <h2 className={styles.heading}>{t.heading}</h2>
      <fieldset className={styles.fieldset} disabled={locked}>
      <label className={styles.check}>
        <input type="checkbox" checked={marker?.visible ?? false} onChange={(e) => update((m) => ({ ...m, visible: e.target.checked }))} />
        {t.visible}
      </label>

      {marker && (
        <>
          <div className={styles.row}>
            <div>
              <label className={styles.label} htmlFor="markerColor">
                {t.color}
              </label>
              <input
                id="markerColor"
                type="color"
                className={styles.colorInput}
                value={marker.color}
                onChange={(e) => update((m) => ({ ...m, color: e.target.value }))}
              />
            </div>
            <div>
              <label className={styles.label} htmlFor="markerSize">
                {t.size}
              </label>
              <input
                id="markerSize"
                type="number"
                className={styles.input}
                min={2}
                value={marker.sizePx}
                onChange={(e) => update((m) => ({ ...m, sizePx: Math.max(2, Number(e.target.value)) }))}
              />
            </div>
          </div>

          <div className={styles.btns}>
            <button type="button" className={styles.button} onClick={setToMapCenter}>
              {t.setToCenter}
            </button>
          </div>
          <p className={styles.hint}>{t.hint}</p>

          <label className={styles.label} htmlFor="markerAppear">
            {t.appear}
          </label>
          <select
            id="markerAppear"
            className={styles.select}
            value={marker.appear.mode}
            onChange={(e) => update((m) => ({ ...m, appear: { ...m.appear, mode: e.target.value as MarkerObject['appear']['mode'] } }))}
          >
            {APPEAR_MODES.map((mode) => (
              <option key={mode} value={mode}>
                {t.appearModes[mode]}
              </option>
            ))}
          </select>

          <div className={styles.row}>
            {marker.appear.mode === 'custom' && (
              <div>
                <label className={styles.label} htmlFor="markerAppearAt">
                  {t.appearAt}
                </label>
                <input
                  id="markerAppearAt"
                  type="number"
                  className={styles.input}
                  min={0}
                  step={0.1}
                  value={marker.appear.atSec ?? 0}
                  onChange={(e) => update((m) => ({ ...m, appear: { ...m.appear, atSec: Math.max(0, Number(e.target.value)) } }))}
                />
              </div>
            )}
            <div>
              <label className={styles.label} htmlFor="markerPopDuration">
                {t.popDuration}
              </label>
              <input
                id="markerPopDuration"
                type="number"
                className={styles.input}
                min={0}
                step={0.1}
                value={marker.appear.popDurationSec}
                onChange={(e) => update((m) => ({ ...m, appear: { ...m.appear, popDurationSec: Math.max(0, Number(e.target.value)) } }))}
              />
            </div>
          </div>

          <label className={styles.check}>
            <input
              type="checkbox"
              checked={marker.pulse.enabled}
              onChange={(e) => update((m) => ({ ...m, pulse: { ...m.pulse, enabled: e.target.checked } }))}
            />
            {t.pulse}
          </label>

          {marker.pulse.enabled && (
            <div className={styles.row3}>
              <div>
                <label className={styles.label} htmlFor="pulsePeriod">
                  {t.pulsePeriod}
                </label>
                <input
                  id="pulsePeriod"
                  type="number"
                  className={styles.input}
                  min={0.2}
                  step={0.1}
                  value={marker.pulse.periodSec}
                  onChange={(e) => update((m) => ({ ...m, pulse: { ...m.pulse, periodSec: Math.max(0.2, Number(e.target.value)) } }))}
                />
              </div>
              <div>
                <label className={styles.label} htmlFor="pulseScale">
                  {t.pulseScale}
                </label>
                <input
                  id="pulseScale"
                  type="number"
                  className={styles.input}
                  min={1.2}
                  step={0.1}
                  value={marker.pulse.scale}
                  onChange={(e) => update((m) => ({ ...m, pulse: { ...m.pulse, scale: Math.max(1.2, Number(e.target.value)) } }))}
                />
              </div>
              <div>
                <label className={styles.label} htmlFor="pulseStrength">
                  {t.pulseStrength}
                </label>
                <input
                  id="pulseStrength"
                  type="number"
                  className={styles.input}
                  min={5}
                  max={100}
                  value={Math.round(marker.pulse.strength * 100)}
                  onChange={(e) =>
                    update((m) => ({
                      ...m,
                      pulse: { ...m.pulse, strength: Math.min(1, Math.max(0.05, Number(e.target.value) / 100)) },
                    }))
                  }
                />
              </div>
            </div>
          )}
        </>
      )}
      </fieldset>
    </section>
  )
}
