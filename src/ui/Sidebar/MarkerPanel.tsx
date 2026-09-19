import { useEditorStore } from '../../state/editorStore'
import { useProjectStore } from '../../state/store'
import type { MarkerObject } from '../../state/types'
import { strings } from '../../i18n'
import styles from './panel.module.css'

export function MarkerPanel() {
  const markers = useProjectStore((s) => s.project.markers)
  const setProject = useProjectStore((s) => s.setProject)
  const locked = useEditorStore((s) => s.locked)
  const t = strings.marker

  function updateMarker(id: string, fn: (m: MarkerObject) => MarkerObject) {
    setProject((p) => ({ ...p, markers: p.markers.map((m) => (m.id === id ? fn(m) : m)) }))
  }

  function deleteMarker(id: string) {
    setProject((p) => ({ ...p, markers: p.markers.filter((m) => m.id !== id) }))
  }

  function applyStyleToAll(sourceId: string) {
    setProject((p) => {
      const source = p.markers.find((m) => m.id === sourceId)
      if (!source) return p
      return {
        ...p,
        markers: p.markers.map((m) =>
          m.id === sourceId ? m : { ...m, color: source.color, sizePx: source.sizePx, pulse: { ...source.pulse } },
        ),
      }
    })
  }

  function setToMapCenter(id: string) {
    const controller = useEditorStore.getState().controller
    if (!controller) return
    const c = controller.map.getCenter()
    updateMarker(id, (m) => ({ ...m, lng: c.lng, lat: c.lat }))
  }

  return (
    <section className={styles.section}>
      <h2 className={styles.heading}>{t.heading}</h2>
      <fieldset className={styles.fieldset} disabled={locked}>
        <p className={styles.hint}>{t.hint}</p>

        {markers.map((marker) => (
          <div key={marker.id} className={styles.card}>
            <div className={styles.cardHeader}>
              <input
                type="text"
                className={styles.input}
                placeholder={t.namePlaceholder}
                value={marker.name ?? ''}
                onChange={(e) => updateMarker(marker.id, (m) => ({ ...m, name: e.target.value || undefined }))}
                aria-label={t.name}
              />
              <button
                type="button"
                className={styles.iconButton}
                onClick={() => deleteMarker(marker.id)}
                title={t.delete}
              >
                ✕
              </button>
            </div>

            <label className={styles.check}>
              <input
                type="checkbox"
                checked={marker.visible}
                onChange={(e) => updateMarker(marker.id, (m) => ({ ...m, visible: e.target.checked }))}
              />
              {t.visible}
            </label>

            <div className={styles.row}>
              <div>
                <label className={styles.label} htmlFor={`markerColor-${marker.id}`}>
                  {t.color}
                </label>
                <input
                  id={`markerColor-${marker.id}`}
                  type="color"
                  className={styles.colorInput}
                  value={marker.color}
                  onChange={(e) => updateMarker(marker.id, (m) => ({ ...m, color: e.target.value }))}
                />
              </div>
              <div>
                <label className={styles.label} htmlFor={`markerSize-${marker.id}`}>
                  {t.size}
                </label>
                <input
                  id={`markerSize-${marker.id}`}
                  type="number"
                  className={styles.input}
                  min={2}
                  value={marker.sizePx}
                  onChange={(e) => updateMarker(marker.id, (m) => ({ ...m, sizePx: Math.max(2, Number(e.target.value)) }))}
                />
              </div>
            </div>

            <div className={styles.btns}>
              <button type="button" className={styles.button} onClick={() => setToMapCenter(marker.id)}>
                {t.setToCenter}
              </button>
              <button
                type="button"
                className={styles.button}
                onClick={() => applyStyleToAll(marker.id)}
                disabled={markers.length < 2}
                title={t.applyToAllHint}
              >
                {t.applyToAll}
              </button>
            </div>

            <div className={styles.row}>
              <div>
                <label className={styles.label} htmlFor={`markerStart-${marker.id}`}>
                  {t.appearAt}
                </label>
                <input
                  id={`markerStart-${marker.id}`}
                  type="number"
                  className={styles.input}
                  min={0}
                  step={0.1}
                  value={marker.appear.startSec}
                  onChange={(e) =>
                    updateMarker(marker.id, (m) => ({
                      ...m,
                      appear: { ...m.appear, startSec: Math.max(0, Number(e.target.value)) },
                    }))
                  }
                />
              </div>
              <div>
                <label className={styles.label} htmlFor={`markerFadeIn-${marker.id}`}>
                  {t.popDuration}
                </label>
                <input
                  id={`markerFadeIn-${marker.id}`}
                  type="number"
                  className={styles.input}
                  min={0}
                  step={0.1}
                  value={marker.appear.fadeInSec}
                  onChange={(e) =>
                    updateMarker(marker.id, (m) => ({
                      ...m,
                      appear: { ...m.appear, fadeInSec: Math.max(0, Number(e.target.value)) },
                    }))
                  }
                />
              </div>
            </div>

            <label className={styles.check}>
              <input
                type="checkbox"
                checked={marker.appear.holdSec === undefined}
                onChange={(e) =>
                  updateMarker(marker.id, (m) => ({
                    ...m,
                    appear: { ...m.appear, holdSec: e.target.checked ? undefined : 2 },
                  }))
                }
              />
              {t.holdForever}
            </label>

            <div className={styles.row}>
              {marker.appear.holdSec !== undefined && (
                <div>
                  <label className={styles.label} htmlFor={`markerHold-${marker.id}`}>
                    {t.holdDuration}
                  </label>
                  <input
                    id={`markerHold-${marker.id}`}
                    type="number"
                    className={styles.input}
                    min={0}
                    step={0.1}
                    value={marker.appear.holdSec}
                    onChange={(e) =>
                      updateMarker(marker.id, (m) => ({
                        ...m,
                        appear: { ...m.appear, holdSec: Math.max(0, Number(e.target.value)) },
                      }))
                    }
                  />
                </div>
              )}
              <div>
                <label className={styles.label} htmlFor={`markerFadeOut-${marker.id}`}>
                  {t.fadeOut}
                </label>
                <input
                  id={`markerFadeOut-${marker.id}`}
                  type="number"
                  className={styles.input}
                  min={0}
                  step={0.1}
                  value={marker.appear.fadeOutSec}
                  onChange={(e) =>
                    updateMarker(marker.id, (m) => ({
                      ...m,
                      appear: { ...m.appear, fadeOutSec: Math.max(0, Number(e.target.value)) },
                    }))
                  }
                />
              </div>
            </div>

            <label className={styles.check}>
              <input
                type="checkbox"
                checked={marker.pulse.enabled}
                onChange={(e) =>
                  updateMarker(marker.id, (m) => ({ ...m, pulse: { ...m.pulse, enabled: e.target.checked } }))
                }
              />
              {t.pulse}
            </label>

            {marker.pulse.enabled && (
              <div className={styles.row3}>
                <div>
                  <label className={styles.label} htmlFor={`pulsePeriod-${marker.id}`}>
                    {t.pulsePeriod}
                  </label>
                  <input
                    id={`pulsePeriod-${marker.id}`}
                    type="number"
                    className={styles.input}
                    min={0.2}
                    step={0.1}
                    value={marker.pulse.periodSec}
                    onChange={(e) =>
                      updateMarker(marker.id, (m) => ({
                        ...m,
                        pulse: { ...m.pulse, periodSec: Math.max(0.2, Number(e.target.value)) },
                      }))
                    }
                  />
                </div>
                <div>
                  <label className={styles.label} htmlFor={`pulseScale-${marker.id}`}>
                    {t.pulseScale}
                  </label>
                  <input
                    id={`pulseScale-${marker.id}`}
                    type="number"
                    className={styles.input}
                    min={1.2}
                    step={0.1}
                    value={marker.pulse.scale}
                    onChange={(e) =>
                      updateMarker(marker.id, (m) => ({
                        ...m,
                        pulse: { ...m.pulse, scale: Math.max(1.2, Number(e.target.value)) },
                      }))
                    }
                  />
                </div>
                <div>
                  <label className={styles.label} htmlFor={`pulseStrength-${marker.id}`}>
                    {t.pulseStrength}
                  </label>
                  <input
                    id={`pulseStrength-${marker.id}`}
                    type="number"
                    className={styles.input}
                    min={5}
                    max={100}
                    value={Math.round(marker.pulse.strength * 100)}
                    onChange={(e) =>
                      updateMarker(marker.id, (m) => ({
                        ...m,
                        pulse: { ...m.pulse, strength: Math.min(1, Math.max(0.05, Number(e.target.value) / 100)) },
                      }))
                    }
                  />
                </div>
              </div>
            )}
          </div>
        ))}
      </fieldset>
    </section>
  )
}
