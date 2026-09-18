import { useEffect, useState } from 'react'
import { findAreaCandidatesWithFallback, resolveAreaGeometry, type AreaLookupCandidate } from '../../map/areaLookup'
import { useEditorStore } from '../../state/editorStore'
import { useSettingsStore } from '../../state/settingsStore'
import { useProjectStore } from '../../state/store'
import { createDefaultArea, type AreaObject } from '../../state/types'
import { strings } from '../../i18n'
import styles from './panel.module.css'

function candidateKey(c: AreaLookupCandidate): string {
  return `${c.osmType}/${c.osmId}`
}

export function AreaListPanel() {
  const areas = useProjectStore((s) => s.project.areas)
  const areaStyles = useProjectStore((s) => s.project.areaStyles)
  const setProject = useProjectStore((s) => s.setProject)
  const locked = useEditorStore((s) => s.locked)
  const pendingAreaPick = useEditorStore((s) => s.pendingAreaPick)
  const enabledTypes = useSettingsStore((s) => s.areaCandidateTypes)
  const t = strings.area

  const [candidates, setCandidates] = useState<AreaLookupCandidate[] | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!pendingAreaPick) return
    let cancelled = false
    setLoading(true)
    setError('')
    setCandidates(null)
    setSelected(new Set())

    findAreaCandidatesWithFallback(pendingAreaPick.lng, pendingAreaPick.lat, enabledTypes)
      .then((found) => {
        if (!cancelled) setCandidates(found)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => {
        if (cancelled) return
        setLoading(false)
        useEditorStore.getState().setPendingAreaPick(null)
      })

    return () => {
      cancelled = true
    }
  }, [pendingAreaPick, enabledTypes])

  function toggleSelected(key: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  async function addSelected() {
    if (!candidates) return
    const chosen = candidates.filter((c) => selected.has(candidateKey(c)))
    setCandidates(null)
    setSelected(new Set())
    const defaultStyleId = areaStyles[0]?.id ?? null

    for (const candidate of chosen) {
      try {
        const geometry = await resolveAreaGeometry(candidate)
        const area = createDefaultArea(
          geometry,
          candidate.name,
          { osmType: candidate.osmType, osmId: candidate.osmId },
          defaultStyleId,
        )
        setProject((p) => ({ ...p, areas: [...p.areas, area] }))
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      }
    }
  }

  function updateArea(id: string, fn: (area: AreaObject) => AreaObject) {
    setProject((p) => ({ ...p, areas: p.areas.map((a) => (a.id === id ? fn(a) : a)) }))
  }

  function moveArea(index: number, direction: -1 | 1) {
    setProject((p) => {
      const target = index + direction
      if (target < 0 || target >= p.areas.length) return p
      const next = p.areas.slice()
      ;[next[index], next[target]] = [next[target], next[index]]
      return { ...p, areas: next }
    })
  }

  function deleteArea(id: string) {
    setProject((p) => ({ ...p, areas: p.areas.filter((a) => a.id !== id) }))
  }

  return (
    <section className={styles.section}>
      <h2 className={styles.heading}>{t.heading}</h2>
      <fieldset className={styles.fieldset} disabled={locked}>
        <p className={styles.hint}>{t.pickHint}</p>

        {loading && <p className={styles.msg}>{t.searching}</p>}
        {error && <p className={styles.msgErr}>{error}</p>}

        {candidates && (
          <div className={styles.card}>
            {candidates.length === 0 ? (
              <p className={styles.msg}>{t.noneFound}</p>
            ) : (
              <>
                {candidates.map((c) => {
                  const key = candidateKey(c)
                  return (
                    <label key={key} className={styles.check}>
                      <input type="checkbox" checked={selected.has(key)} onChange={() => toggleSelected(key)} />
                      {c.name} — {t.kinds[c.kind]} {c.source === 'local' && t.localSource}
                    </label>
                  )
                })}
                <div className={styles.btns}>
                  <button type="button" className={styles.button} onClick={addSelected} disabled={selected.size === 0}>
                    {t.addSelected}
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {areas.map((area, index) => (
          <div key={area.id} className={styles.card}>
            <div className={styles.cardHeader}>
              <input
                type="text"
                className={styles.input}
                value={area.name}
                onChange={(e) => updateArea(area.id, (a) => ({ ...a, name: e.target.value }))}
              />
              <button type="button" className={styles.iconButton} onClick={() => deleteArea(area.id)} title={t.delete}>
                ✕
              </button>
            </div>

            <div className={styles.btns}>
              <button
                type="button"
                className={styles.iconButton}
                onClick={() => moveArea(index, -1)}
                disabled={index === 0}
                title={t.moveUp}
              >
                ↑
              </button>
              <button
                type="button"
                className={styles.iconButton}
                onClick={() => moveArea(index, 1)}
                disabled={index === areas.length - 1}
                title={t.moveDown}
              >
                ↓
              </button>
              <label className={styles.check}>
                <input
                  type="checkbox"
                  checked={area.visible}
                  onChange={(e) => updateArea(area.id, (a) => ({ ...a, visible: e.target.checked }))}
                />
                {t.visible}
              </label>
            </div>

            <div
              className={styles.radioGrid}
              style={{ gridTemplateColumns: `repeat(${areaStyles.length + 1}, 1fr)` }}
            >
              <label>
                <input
                  type="radio"
                  name={`area-style-${area.id}`}
                  checked={area.styleId === null}
                  onChange={() => updateArea(area.id, (a) => ({ ...a, styleId: null }))}
                />
                {t.noStyle}
              </label>
              {areaStyles.map((style) => (
                <label key={style.id}>
                  <input
                    type="radio"
                    name={`area-style-${area.id}`}
                    checked={area.styleId === style.id}
                    onChange={() => updateArea(area.id, (a) => ({ ...a, styleId: style.id }))}
                  />
                  {style.name}
                </label>
              ))}
            </div>
          </div>
        ))}
      </fieldset>
    </section>
  )
}
