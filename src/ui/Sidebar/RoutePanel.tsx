import { useState } from 'react'
import { fetchRoute } from '../../map/osrmClient'
import { totalLineLengthMeters, waypointsToStraightLine } from '../../map/routeGeometry'
import { useEditorStore } from '../../state/editorStore'
import { useProjectStore } from '../../state/store'
import type { RouteObject, RouteProfile, RoutingMode, RouteWaypoint } from '../../state/types'
import { strings } from '../../i18n'
import { fmtNum } from '../format'
import styles from './panel.module.css'

const APPEAR_MODES: RouteObject['appear']['mode'][] = ['start', 'zoomStart', 'zoomEnd', 'custom']
const ROUTING_MODES: RoutingMode[] = ['osrm', 'straight']
const PROFILES: RouteProfile[] = ['driving', 'walking', 'cycling']
const REVEAL_MODES: RouteObject['reveal'][] = ['instant', 'progressive']

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
      return { ...r, waypoints, geometry }
    })
  }

  function deleteWaypoint(index: number) {
    updateRoute((r) => {
      const waypoints = r.waypoints.filter((_, i) => i !== index)
      const geometry = r.routingMode === 'straight' ? recomputeStraightGeometry(waypoints) : r.geometry
      return { ...r, waypoints, geometry }
    })
  }

  function setRoutingMode(mode: RoutingMode) {
    setError('')
    updateRoute((r) =>
      mode === 'straight'
        ? { ...r, routingMode: mode, geometry: recomputeStraightGeometry(r.waypoints), osrmDurationSec: null }
        : { ...r, routingMode: mode, geometry: null, osrmDurationSec: null },
    )
  }

  async function calculateRoute() {
    if (!route || route.waypoints.length < 2) return
    setCalculating(true)
    setError('')
    try {
      const result = await fetchRoute(route.waypoints, route.profile)
      updateRoute((r) => ({ ...r, geometry: result.geometry, osrmDurationSec: result.durationSec }))
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
              {route.waypoints.map((_, index) => (
                <div key={index} className={styles.cardHeader}>
                  <span>{waypointLabel(index, route.waypoints.length)}</span>
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
                <label className={styles.label}>{t.profile}</label>
                <select
                  className={styles.select}
                  value={route.profile}
                  onChange={(e) => updateRoute((r) => ({ ...r, profile: e.target.value as RouteProfile }))}
                >
                  {PROFILES.map((profile) => (
                    <option key={profile} value={profile}>
                      {t.profiles[profile]}
                    </option>
                  ))}
                </select>
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

            <label className={styles.label}>{t.reveal}</label>
            <div className={styles.row}>
              {REVEAL_MODES.map((mode) => (
                <label key={mode} className={styles.check}>
                  <input
                    type="radio"
                    name="route-reveal"
                    checked={route.reveal === mode}
                    onChange={() => updateRoute((r) => ({ ...r, reveal: mode }))}
                  />
                  {t.revealModes[mode]}
                </label>
              ))}
            </div>
            {route.reveal === 'progressive' && (
              <div>
                <label className={styles.label}>{t.speed}</label>
                <input
                  type="number"
                  className={styles.input}
                  min={1}
                  step={5}
                  value={route.drawSpeedKmh}
                  onChange={(e) => updateRoute((r) => ({ ...r, drawSpeedKmh: Math.max(1, Number(e.target.value)) }))}
                />
              </div>
            )}

            <label className={styles.label}>{t.appear}</label>
            <select
              className={styles.select}
              value={route.appear.mode}
              onChange={(e) =>
                updateRoute((r) => ({ ...r, appear: { ...r.appear, mode: e.target.value as RouteObject['appear']['mode'] } }))
              }
            >
              {APPEAR_MODES.map((mode) => (
                <option key={mode} value={mode}>
                  {strings.marker.appearModes[mode]}
                </option>
              ))}
            </select>
            {route.appear.mode === 'custom' && (
              <div>
                <label className={styles.label}>{t.appearAt}</label>
                <input
                  type="number"
                  className={styles.input}
                  min={0}
                  step={0.1}
                  value={route.appear.atSec ?? 0}
                  onChange={(e) =>
                    updateRoute((r) => ({ ...r, appear: { ...r.appear, atSec: Math.max(0, Number(e.target.value)) } }))
                  }
                />
              </div>
            )}

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
