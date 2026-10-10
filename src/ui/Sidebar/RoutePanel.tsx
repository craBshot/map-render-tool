import { useEffect, useRef, useState } from 'react'
import { fetchRoute } from '../../map/osrmClient'
import { totalLineLengthMeters, waypointsToStraightLine } from '../../map/routeGeometry'
import { useEditorStore } from '../../state/editorStore'
import { useProjectStore } from '../../state/store'
import { createDefaultRoute, resolveActiveRoute, type RouteObject, type RoutingMode, type RouteWaypoint } from '../../state/types'
import { strings } from '../../i18n'
import { describePoint, fmtNum, routeLabel, waypointLetter } from '../format'
import { CollapsibleSection } from './CollapsibleSection'
import styles from './panel.module.css'

const ROUTING_MODES: RoutingMode[] = ['osrm', 'straight']

function formatHoursMinutes(totalSec: number): string {
  const totalMin = Math.round(totalSec / 60)
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  return `${h}:${String(m).padStart(2, '0')} h`
}

function recomputeStraightGeometry(waypoints: RouteWaypoint[]): GeoJSON.LineString | null {
  return waypoints.length >= 2 ? waypointsToStraightLine(waypoints) : null
}

export function RoutePanel() {
  const routes = useProjectStore((s) => s.project.routes)
  const setProject = useProjectStore((s) => s.setProject)
  const locked = useEditorStore((s) => s.locked)
  const selectedObjectId = useEditorStore((s) => s.selectedObjectId)
  const t = strings.route
  const activeRouteId = resolveActiveRoute(routes, selectedObjectId)?.id

  function addRoute() {
    const route = createDefaultRoute([])
    setProject((p) => ({ ...p, routes: [...p.routes, route] }))
    useEditorStore.getState().setSelectedObjectId(route.id)
  }

  return (
    <CollapsibleSection sectionKey="route" heading={t.heading}>
      <fieldset className={styles.fieldset} disabled={locked}>
        <p className={styles.hint}>{t.pickHint}</p>
        {routes.map((route, index) => (
          <RouteCard key={route.id} route={route} label={routeLabel(index, routes.length)} active={route.id === activeRouteId} />
        ))}
        <div className={styles.btns}>
          <button type="button" className={styles.button} onClick={addRoute}>
            {t.newRoute}
          </button>
        </div>
      </fieldset>
    </CollapsibleSection>
  )
}

interface RouteCardProps {
  route: RouteObject
  label: string
  /** The route Route-mode right-clicks currently extend (see resolveActiveRoute). */
  active: boolean
}

/** One route's settings + waypoint list, collapsible. Clicking anywhere in it makes it the active route. */
function RouteCard({ route, label, active }: RouteCardProps) {
  const setProject = useProjectStore((s) => s.setProject)
  const selectedObjectId = useEditorStore((s) => s.selectedObjectId)
  const focusFieldRequest = useEditorStore((s) => s.focusFieldRequest)
  const t = strings.route
  const [open, setOpen] = useState(true)
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  useEffect(() => {
    if (!selectedObjectId) return
    cardRefs.current.get(selectedObjectId)?.scrollIntoView({ block: 'nearest' })
  }, [selectedObjectId])

  // Double-clicking a route waypoint on the map jumps into its hold-time field; double-clicking
  // the route LINE between two waypoints (a "leg") jumps into the arriving waypoint's travel-time
  // field instead (field: 'travelSec') — see pointDoubleClick.ts. One-shot: self-clears once handled.
  const holdFieldRefs = useRef<Map<string, HTMLInputElement>>(new Map())
  const travelFieldRefs = useRef<Map<string, HTMLInputElement>>(new Map())
  useEffect(() => {
    if (focusFieldRequest?.kind !== 'route') return
    if (!route.waypoints.some((w) => w.id === focusFieldRequest.id)) return
    setOpen(true)
    const refs = focusFieldRequest.field === 'travelSec' ? travelFieldRefs : holdFieldRefs
    const el = refs.current.get(focusFieldRequest.id)
    if (!el) return
    el.focus()
    el.select()
    useEditorStore.getState().setFocusFieldRequest(null)
  }, [focusFieldRequest])

  const [calculating, setCalculating] = useState(false)
  const [error, setError] = useState('')

  function updateRoute(fn: (route: RouteObject) => RouteObject) {
    setProject((p) => ({ ...p, routes: p.routes.map((r) => (r.id === route.id ? fn(r) : r)) }))
  }

  function moveWaypoint(index: number, direction: -1 | 1) {
    updateRoute((r) => {
      const target = index + direction
      if (target < 0 || target >= r.waypoints.length) return r
      const waypoints = r.waypoints.slice()
      ;[waypoints[index], waypoints[target]] = [waypoints[target], waypoints[index]]
      const geometry = r.routingMode === 'straight' ? recomputeStraightGeometry(waypoints) : r.geometry
      return { ...r, waypoints, geometry, legDistancesM: null }
    })
  }

  function deleteWaypoint(index: number) {
    updateRoute((r) => {
      const waypoints = r.waypoints.filter((_, i) => i !== index)
      const geometry = r.routingMode === 'straight' ? recomputeStraightGeometry(waypoints) : r.geometry
      return { ...r, waypoints, geometry, legDistancesM: null }
    })
  }

  function updateWaypointTiming(index: number, fn: (wp: RouteWaypoint) => RouteWaypoint) {
    updateRoute((r) => ({ ...r, waypoints: r.waypoints.map((w, i) => (i === index ? fn(w) : w)) }))
  }

  function setRoutingMode(mode: RoutingMode) {
    setError('')
    updateRoute((r) =>
      mode === 'straight'
        ? { ...r, routingMode: mode, geometry: recomputeStraightGeometry(r.waypoints), osrmDurationSec: null, legDistancesM: null }
        : { ...r, routingMode: mode, geometry: null, osrmDurationSec: null, legDistancesM: null },
    )
  }

  async function calculateRoute() {
    if (route.waypoints.length < 2) return
    setCalculating(true)
    setError('')
    try {
      const result = await fetchRoute(route.waypoints)
      updateRoute((r) => ({
        ...r,
        geometry: result.geometry,
        osrmDurationSec: result.durationSec,
        legDistancesM: result.legDistancesM,
      }))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setCalculating(false)
    }
  }

  function deleteRoute() {
    setError('')
    setProject((p) => ({ ...p, routes: p.routes.filter((r) => r.id !== route.id) }))
  }

  function waypointLabel(index: number, total: number): string {
    if (index === 0) return t.waypointStart
    if (index === total - 1) return t.waypointDestination
    return t.waypointVia(index)
  }

  const totalKm = route.geometry ? totalLineLengthMeters(route.geometry.coordinates) / 1000 : null

  return (
    <details
      className={`${styles.routeGroup} ${active ? styles.routeGroupActive : ''}`}
      open={open}
      onToggle={(e) => setOpen(e.currentTarget.open)}
      onClickCapture={() => {
        if (!active) useEditorStore.getState().setSelectedObjectId(route.id)
      }}
      data-testid={`route-card-${route.id}`}
    >
      <summary className={styles.routeSummary}>
        <span className={styles.routeSwatch} style={{ background: route.color }} />
        {label}
      </summary>
      <div>
        {route.waypoints.map((wp, index) => (
          <div
            key={wp.id}
            ref={(el) => {
              if (el) cardRefs.current.set(wp.id, el)
              else cardRefs.current.delete(wp.id)
            }}
            className={`${styles.card} ${selectedObjectId === wp.id ? styles.cardSelected : ''}`}
            data-testid={`route-waypoint-${index}`}
          >
            <div className={styles.cardHeader}>
              <div>
                <span>
                  {waypointLetter(index)} — {waypointLabel(index, route.waypoints.length)}
                </span>
                <div className={styles.coords}>{describePoint(wp.lng, wp.lat)}</div>
              </div>
              <div className={styles.btns}>
                <button
                  type="button"
                  className={styles.iconButton}
                  onClick={() => moveWaypoint(index, -1)}
                  disabled={index === 0}
                  title={t.moveUp}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className={styles.iconButton}
                  onClick={() => moveWaypoint(index, 1)}
                  disabled={index === route.waypoints.length - 1}
                  title={t.moveDown}
                >
                  ↓
                </button>
                <button
                  type="button"
                  className={styles.iconButton}
                  onClick={() => deleteWaypoint(index)}
                  title={t.deleteWaypoint}
                >
                  ✕
                </button>
              </div>
            </div>

            <div className={styles.row}>
              {index > 0 && (
                <div>
                  <label className={styles.label} htmlFor={`routeTravel-${wp.id}`}>
                    {t.travelSec}
                  </label>
                  <input
                    id={`routeTravel-${wp.id}`}
                    ref={(el) => {
                      if (el) travelFieldRefs.current.set(wp.id, el)
                      else travelFieldRefs.current.delete(wp.id)
                    }}
                    type="number"
                    className={styles.input}
                    min={0}
                    step={0.5}
                    value={wp.travelSec}
                    onChange={(e) =>
                      updateWaypointTiming(index, (w) => ({ ...w, travelSec: Math.max(0, Number(e.target.value)) }))
                    }
                  />
                </div>
              )}
              <div>
                <label className={styles.label} htmlFor={`routeHold-${wp.id}`}>
                  {t.holdSec}
                </label>
                <input
                  id={`routeHold-${wp.id}`}
                  ref={(el) => {
                    if (el) holdFieldRefs.current.set(wp.id, el)
                    else holdFieldRefs.current.delete(wp.id)
                  }}
                  type="number"
                  className={styles.input}
                  min={0}
                  step={0.5}
                  value={wp.holdSec}
                  onChange={(e) =>
                    updateWaypointTiming(index, (w) => ({ ...w, holdSec: Math.max(0, Number(e.target.value)) }))
                  }
                />
              </div>
            </div>
          </div>
        ))}
      </div>

      <label className={styles.label}>{t.routingMode}</label>
      <div className={styles.row}>
        {ROUTING_MODES.map((mode) => (
          <label key={mode} className={styles.check}>
            <input
              type="radio"
              name={`route-routing-mode-${route.id}`}
              checked={route.routingMode === mode}
              onChange={() => setRoutingMode(mode)}
            />
            {t.routingModes[mode]}
          </label>
        ))}
      </div>

      {route.routingMode === 'osrm' && (
        <>
          <div className={styles.btns}>
            <button
              type="button"
              className={styles.button}
              onClick={calculateRoute}
              disabled={route.waypoints.length < 2 || calculating}
            >
              {t.calculate}
            </button>
          </div>
          {calculating && <p className={styles.msg}>{t.calculating}</p>}
        </>
      )}

      {error && <p className={styles.msgErr}>{error}</p>}

      {totalKm !== null && (
        <p className={styles.msg}>
          {route.osrmDurationSec != null
            ? t.distanceWithDuration(fmtNum(totalKm, 1), formatHoursMinutes(route.osrmDurationSec))
            : t.distance(fmtNum(totalKm, 1))}
        </p>
      )}

      <label className={styles.check}>
        <input
          type="checkbox"
          checked={route.visible}
          onChange={(e) => updateRoute((r) => ({ ...r, visible: e.target.checked }))}
        />
        {t.visible}
      </label>

      <div className={styles.row}>
        <div>
          <label className={styles.label}>{t.color}</label>
          <input
            type="color"
            className={styles.colorInput}
            value={route.color}
            onChange={(e) => updateRoute((r) => ({ ...r, color: e.target.value }))}
          />
        </div>
        <div>
          <label className={styles.label}>{t.width}</label>
          <input
            type="number"
            className={styles.input}
            min={1}
            step={0.5}
            value={route.widthPx}
            onChange={(e) => updateRoute((r) => ({ ...r, widthPx: Math.max(1, Number(e.target.value)) }))}
          />
        </div>
      </div>

      <div>
        <label className={styles.label}>{t.appearAt}</label>
        <input
          type="number"
          className={styles.input}
          min={0}
          step={0.1}
          value={route.appear.startSec}
          onChange={(e) =>
            updateRoute((r) => ({ ...r, appear: { startSec: Math.max(0, Number(e.target.value)) } }))
          }
        />
      </div>

      <div className={styles.btns}>
        <button type="button" className={styles.button} onClick={deleteRoute}>
          {t.deleteRoute}
        </button>
      </div>
    </details>
  )
}
