import { useState } from 'react'
import { fetchRoute } from '../../map/osrmClient'
import { totalLineLengthMeters, waypointsToStraightLine } from '../../map/routeGeometry'
import { useEditorStore } from '../../state/editorStore'
import { useProjectStore } from '../../state/store'
import type { RouteObject, RoutingMode, RouteWaypoint } from '../../state/types'
import { strings } from '../../i18n'
import { describePoint, fmtNum, waypointLetter } from '../format'
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
  const route = useProjectStore((s) => s.project.route)
  const setProject = useProjectStore((s) => s.setProject)
  const locked = useEditorStore((s) => s.locked)
  const t = strings.route

  const [calculating, setCalculating] = useState(false)
  const [error, setError] = useState('')

  function updateRoute(fn: (route: RouteObject) => RouteObject) {
    setProject((p) => (p.route ? { ...p, route: fn(p.route) } : p))
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
    if (!route || route.waypoints.length < 2) return
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
    setProject((p) => ({ ...p, route: null }))
  }

  function waypointLabel(index: number, total: number): string {
    if (index === 0) return t.waypointStart
    if (index === total - 1) return t.waypointDestination
    return t.waypointVia(index)
  }

  const totalKm = route?.geometry ? totalLineLengthMeters(route.geometry.coordinates) / 1000 : null

  return (
    <section className={styles.section}>
      <h2 className={styles.heading}>{t.heading}</h2>
      <fieldset className={styles.fieldset} disabled={locked}>
        <p className={styles.hint}>{t.pickHint}</p>

        {route && (
          <>
            <div className={styles.card}>
              {route.waypoints.map((wp, index) => (
                <div key={wp.id}>
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
                    name="route-routing-mode"
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
          </>
        )}
      </fieldset>
    </section>
  )
}
