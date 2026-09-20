import { useEffect, useRef, useState } from 'react'
import { findAreaCandidatesWithFallback, resolveAreaGeometry, type AreaLookupCandidate } from '../../map/areaLookup'
import { useEditorStore } from '../../state/editorStore'
import { useSettingsStore } from '../../state/settingsStore'
import { useProjectStore } from '../../state/store'
import { createDefaultArea, type AreaObject } from '../../state/types'
import { strings } from '../../i18n'
import { CollapsibleSection } from './CollapsibleSection'
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
  const selectedObjectId = useEditorStore((s) => s.selectedObjectId)
  const enabledTypes = useSettingsStore((s) => s.areaCandidateTypes)
  const t = strings.area

  const [candidates, setCandidates] = useState<AreaLookupCandidate[] | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)

  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  useEffect(() => {
    if (!selectedObjectId) return
    cardRefs.current.get(selectedObjectId)?.scrollIntoView({ block: 'nearest' })
  }, [selectedObjectId])

  // Double-clicking an area polygon on the map jumps straight into its appear-at field, text
  // pre-selected — see pointDoubleClick.ts. One-shot: self-clears once handled.
  const focusFieldRequest = useEditorStore((s) => s.focusFieldRequest)
  const startFieldRefs = useRef<Map<string, HTMLInputElement>>(new Map())
  useEffect(() => {
    if (focusFieldRequest?.kind !== 'area') return
    const el = startFieldRefs.current.get(focusFieldRequest.id)
    if (!el) return
    el.focus()
    el.select()
    useEditorStore.getState().setFocusFieldRequest(null)
  }, [focusFieldRequest])

  const [error, setError] = useState('')

  useEffect(() => {
    if (!pendingAreaPick) return
    // The candidate list rendered below only makes sense to the user if this section is visible —
    // force it open even if it was collapsed, rather than silently populating hidden content.
    useEditorStore.getState().setSidebarSectionOpen('areas', true)
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
    <CollapsibleSection sectionKey="areas" heading={t.heading}>
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
          <div
            key={area.id}
            ref={(el) => {
              if (el) cardRefs.current.set(area.id, el)
              else cardRefs.current.delete(area.id)
            }}
            className={`${styles.card} ${selectedObjectId === area.id ? styles.cardSelected : ''}`}
          >
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

            <div className={styles.row}>
              <div>
                <label className={styles.label} htmlFor={`areaStart-${area.id}`}>
                  {t.appearAt}
                </label>
                <input
                  id={`areaStart-${area.id}`}
                  ref={(el) => {
                    if (el) startFieldRefs.current.set(area.id, el)
                    else startFieldRefs.current.delete(area.id)
                  }}
                  type="number"
                  className={styles.input}
                  min={0}
                  step={0.1}
                  value={area.appear.startSec}
                  onChange={(e) =>
                    updateArea(area.id, (a) => ({
                      ...a,
                      appear: { ...a.appear, startSec: Math.max(0, Number(e.target.value)) },
                    }))
                  }
                />
              </div>
              <div>
                <label className={styles.label} htmlFor={`areaFadeIn-${area.id}`}>
                  {t.fadeDuration}
                </label>
                <input
                  id={`areaFadeIn-${area.id}`}
                  type="number"
                  className={styles.input}
                  min={0}
                  step={0.1}
                  value={area.appear.fadeInSec}
                  onChange={(e) =>
                    updateArea(area.id, (a) => ({
                      ...a,
                      appear: { ...a.appear, fadeInSec: Math.max(0, Number(e.target.value)) },
                    }))
                  }
                />
              </div>
            </div>

            <label className={styles.check}>
              <input
                type="checkbox"
                checked={area.appear.holdSec === undefined}
                onChange={(e) =>
                  updateArea(area.id, (a) => ({
                    ...a,
                    appear: { ...a.appear, holdSec: e.target.checked ? undefined : 2 },
                  }))
                }
              />
              {t.holdForever}
            </label>

            <div className={styles.row}>
              {area.appear.holdSec !== undefined && (
                <div>
                  <label className={styles.label} htmlFor={`areaHold-${area.id}`}>
                    {t.holdDuration}
                  </label>
                  <input
                    id={`areaHold-${area.id}`}
                    type="number"
                    className={styles.input}
                    min={0}
                    step={0.1}
                    value={area.appear.holdSec}
                    onChange={(e) =>
                      updateArea(area.id, (a) => ({
                        ...a,
                        appear: { ...a.appear, holdSec: Math.max(0, Number(e.target.value)) },
                      }))
                    }
                  />
                </div>
              )}
              <div>
                <label className={styles.label} htmlFor={`areaFadeOut-${area.id}`}>
                  {t.fadeOut}
                </label>
                <input
                  id={`areaFadeOut-${area.id}`}
                  type="number"
                  className={styles.input}
                  min={0}
                  step={0.1}
                  value={area.appear.fadeOutSec}
                  onChange={(e) =>
                    updateArea(area.id, (a) => ({
                      ...a,
                      appear: { ...a.appear, fadeOutSec: Math.max(0, Number(e.target.value)) },
                    }))
                  }
                />
              </div>
            </div>
          </div>
        ))}
      </fieldset>
    </CollapsibleSection>
  )
}
