import { useState } from 'react'
import { useEditorStore } from '../../state/editorStore'
import { strings } from '../../i18n'
import { CollapsibleSection } from './CollapsibleSection'
import styles from './panel.module.css'

interface NominatimResult {
  display_name: string
  boundingbox: [string, string, string, string] // south, north, west, east
}

export function SearchPanel() {
  const [query, setQuery] = useState('')
  const [message, setMessage] = useState('')
  const [isError, setIsError] = useState(false)
  const locked = useEditorStore((s) => s.locked)
  const t = strings.search

  async function search() {
    const q = query.trim()
    if (!q) return
    setIsError(false)
    setMessage(t.searching)

    try {
      // Nominatim usage policy: max 1 request/s, no search-as-you-type —
      // this fires only on explicit submit (button click or Enter).
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=1&accept-language=de&q=${encodeURIComponent(q)}`,
      )
      if (!res.ok) throw new Error(t.serviceError(res.status))
      const results: NominatimResult[] = await res.json()
      if (results.length === 0) {
        setIsError(true)
        setMessage(t.notFound(q))
        return
      }

      const [south, north, west, east] = results[0].boundingbox.map(Number)
      useEditorStore.getState().controller?.map.fitBounds([
        [west, south],
        [east, north],
      ], { padding: 40, maxZoom: 10, duration: 700 })
      setMessage(results[0].display_name.split(',').slice(0, 3).join(','))
    } catch (err) {
      setIsError(true)
      setMessage(`${t.failedPrefix}${err instanceof Error ? err.message : String(err)}`)
    }
  }

  return (
    <CollapsibleSection sectionKey="search" heading={t.heading}>
      <div className={styles.searchRow}>
        <input
          type="text"
          className={styles.input}
          placeholder={t.placeholder}
          autoComplete="off"
          value={query}
          disabled={locked}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') search()
          }}
        />
        <button type="button" className={styles.button} onClick={search} disabled={locked}>
          {t.button}
        </button>
      </div>
      {message && <p className={isError ? styles.msgErr : styles.msg}>{message}</p>}
    </CollapsibleSection>
  )
}
