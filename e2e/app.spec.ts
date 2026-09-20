import { execFile } from 'node:child_process'
import { statSync } from 'node:fs'
import { promisify } from 'node:util'
import { expect, test } from '@playwright/test'
import { mockExternalServices, type MockExternalServicesOptions } from './fixtures/routeMocks'

const execFileAsync = promisify(execFile)

async function gotoApp(page: import('@playwright/test').Page, options: MockExternalServicesOptions = {}) {
  await page.addInitScript(() => {
    window.__E2E__ = true
  })
  await mockExternalServices(page, options)
  await page.goto('/')
  await page.locator('canvas.maplibregl-canvas').waitFor()
}

/** True if at least one marker's dot layer exists and is not hidden. */
async function isMarkerVisible(page: import('@playwright/test').Page): Promise<boolean> {
  return page.evaluate(() => {
    const controller = window.__mapController
    if (!controller) return false
    const dotLayer = controller.map.getStyle().layers.find((l) => l.id.endsWith('-dot'))
    if (!dotLayer) return false
    return controller.map.getLayoutProperty(dotLayer.id, 'visibility') !== 'none'
  })
}

/** Number of currently rendered marker dot layers (= number of markers ever placed, right-click never replaces). */
async function markerDotCount(page: import('@playwright/test').Page): Promise<number> {
  return page.evaluate(() => {
    const controller = window.__mapController
    if (!controller) return 0
    return controller.map.getStyle().layers.filter((l) => l.id.startsWith('marker-') && l.id.endsWith('-dot')).length
  })
}

/** True if an area's fill layer exists and is not hidden. */
async function isAreaVisible(page: import('@playwright/test').Page): Promise<boolean> {
  return page.evaluate(() => {
    const controller = window.__mapController
    if (!controller) return false
    const fillLayer = controller.map.getStyle().layers.find((l) => l.id.startsWith('area-') && l.id.endsWith('-fill'))
    if (!fillLayer) return false
    return controller.map.getLayoutProperty(fillLayer.id, 'visibility') !== 'none'
  })
}

/** True if the route line layer exists and is not hidden. */
async function isRouteVisible(page: import('@playwright/test').Page): Promise<boolean> {
  return page.evaluate(() => {
    const controller = window.__mapController
    if (!controller) return false
    const lineLayer = controller.map.getStyle().layers.find((l) => l.id === 'route-line-layer')
    if (!lineLayer) return false
    return controller.map.getLayoutProperty(lineLayer.id, 'visibility') !== 'none'
  })
}

/** The route's raw waypoint list, read straight from the persisted project state. */
async function getRouteWaypoints(
  page: import('@playwright/test').Page,
): Promise<{ id: string; lng: number; lat: number; holdSec: number; travelSec: number }[]> {
  return page.evaluate(() => {
    const raw = localStorage.getItem('map-render-tool:project')
    if (!raw) return []
    return JSON.parse(raw).route?.waypoints ?? []
  })
}

/** The camera's raw waypoint list, read straight from the persisted project state. */
async function getCameraWaypoints(
  page: import('@playwright/test').Page,
): Promise<{ id: string; lng: number; lat: number; zr: number; holdSec: number; travelSec: number }[]> {
  return page.evaluate(() => {
    const raw = localStorage.getItem('map-render-tool:project')
    if (!raw) return []
    return JSON.parse(raw).camera.waypoints
  })
}

/** The route's own appear.startSec, read straight from the persisted project state. */
async function getRouteAppearStartSec(page: import('@playwright/test').Page): Promise<number | null> {
  return page.evaluate(() => {
    const raw = localStorage.getItem('map-render-tool:project')
    if (!raw) return null
    return JSON.parse(raw).route?.appear.startSec ?? null
  })
}

/** The route's own id, read straight from the persisted project state. */
async function getRouteId(page: import('@playwright/test').Page): Promise<string | null> {
  return page.evaluate(() => {
    const raw = localStorage.getItem('map-render-tool:project')
    if (!raw) return null
    return JSON.parse(raw).route?.id ?? null
  })
}

/** The project's raw marker list, read straight from the persisted project state. */
async function getMarkers(
  page: import('@playwright/test').Page,
): Promise<{ id: string; appear: { startSec: number; fadeInSec: number; holdSec?: number; fadeOutSec: number } }[]> {
  return page.evaluate(() => {
    const raw = localStorage.getItem('map-render-tool:project')
    if (!raw) return []
    return JSON.parse(raw).markers
  })
}

/**
 * Expands a Sidebar section by its heading text — every section but "Kamerafahrt" is
 * collapsed by default, so any test that interacts with a section's own fields (not just
 * the map/Timeline) needs to open it first. Idempotent: a no-op if already open, so it's
 * safe to call even when a section might already be expanded (e.g. by a prior action).
 */
async function openSection(page: import('@playwright/test').Page, heading: string): Promise<void> {
  const details = page.locator('details').filter({ has: page.locator('summary', { hasText: heading }) })
  const isOpen = await details.evaluate((el) => (el as HTMLDetailsElement).open)
  if (!isOpen) await details.locator('summary').click()
}

test('loads without console errors', async ({ page }) => {
  const errors: string[] = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text())
  })
  page.on('pageerror', (err) => errors.push(err.message))

  await gotoApp(page)
  await page.waitForTimeout(500)

  expect(errors).toEqual([])
})

test('right-clicks add markers, which stay visible after a style change', async ({ page }) => {
  await gotoApp(page)

  await page.locator('canvas.maplibregl-canvas').click({ button: 'right', position: { x: 200, y: 150 } })
  await expect.poll(() => isMarkerVisible(page)).toBe(true)
  await expect.poll(() => markerDotCount(page)).toBe(1)

  // A second right-click must add a marker, not replace the first one.
  await page.locator('canvas.maplibregl-canvas').click({ button: 'right', position: { x: 260, y: 180 } })
  await expect.poll(() => markerDotCount(page)).toBe(2)

  // setStyle(diff:false) tears the map's layers down and rebuilds them —
  // the known pitfall this must survive.
  await openSection(page, 'Aussehen')
  await page.selectOption('#mapStyle', 'dark')
  await page.waitForTimeout(300)
  await expect.poll(() => isMarkerVisible(page)).toBe(true)
  await expect.poll(() => markerDotCount(page)).toBe(2)
})

test('marker: deleting one from the panel removes its map layers, not just its dot', async ({ page }) => {
  await gotoApp(page)

  await page.locator('canvas.maplibregl-canvas').click({ button: 'right', position: { x: 200, y: 150 } })
  await page.locator('canvas.maplibregl-canvas').click({ button: 'right', position: { x: 260, y: 180 } })
  await expect.poll(() => markerDotCount(page)).toBe(2)

  // Scope to the Marker panel's own section — the camera panel also has ✕ delete
  // buttons (for waypoints), just disabled at the default 2-waypoint minimum.
  await openSection(page, 'Marker')
  const markerSection = page.locator('details').filter({ has: page.locator('summary', { hasText: /^Marker$/ }) })
  await markerSection.getByRole('button', { name: '✕' }).first().click()
  await expect.poll(() => markerDotCount(page)).toBe(1)

  // The deleted marker's halo layer (and source) must be gone too, not just its dot —
  // regression guard for MapController.removeStaleMarkerLayers.
  const remainingMarkerLayers = await page.evaluate(() => {
    const controller = window.__mapController
    if (!controller) return -1
    return controller.map.getStyle().layers.filter((l) => l.id.startsWith('marker-')).length
  })
  expect(remainingMarkerLayers).toBe(3) // one remaining marker × (halo + dot + label)
})

test('marker: naming it shows a text label layer on the map', async ({ page }) => {
  await gotoApp(page)

  await page.locator('canvas.maplibregl-canvas').click({ button: 'right', position: { x: 200, y: 150 } })
  await expect.poll(() => markerDotCount(page)).toBe(1)
  await openSection(page, 'Marker')

  async function labelState(): Promise<{ visibility: string | undefined; text: unknown } | null> {
    return page.evaluate(() => {
      const controller = window.__mapController
      if (!controller) return null
      const labelLayer = controller.map.getStyle().layers.find((l) => l.id.endsWith('-label'))
      if (!labelLayer) return null
      return {
        visibility: controller.map.getLayoutProperty(labelLayer.id, 'visibility'),
        text: controller.map.getLayoutProperty(labelLayer.id, 'text-field'),
      }
    })
  }

  // No name yet — the label layer exists (created alongside halo/dot) but stays hidden.
  await expect.poll(async () => (await labelState())?.visibility).not.toBe('visible')

  await page.getByRole('textbox', { name: 'Name' }).fill('Berghütte')
  await expect.poll(async () => (await labelState())?.visibility).toBe('visible')
  expect((await labelState())?.text).toBe('Berghütte')

  // Clearing the name hides the label again rather than showing an empty string.
  await page.getByRole('textbox', { name: 'Name' }).fill('')
  await expect.poll(async () => (await labelState())?.visibility).not.toBe('visible')
})

test('timeline: dragging a marker\'s bar changes its startSec, and a plain click selects it', async ({ page }) => {
  await gotoApp(page)

  await page.locator('canvas.maplibregl-canvas').click({ button: 'right', position: { x: 200, y: 150 } })
  const [before] = await getMarkers(page)
  const originalStartSec = before.appear.startSec // default project: 5 (arrival at the last of 2 waypoints, totalSec 7)

  const track = page.locator(`[data-testid="timeline-track-${before.id}"]`)
  const box = await track.boundingBox()
  // The bar (first child of the track) spans only the marker's own [startSec, end] range — the
  // reposition-drag/select hit target is scoped to it, not the full track, so the gesture must
  // start on it rather than anywhere on the track.
  const bar = track.locator('div').first()
  const barBox = await bar.boundingBox()
  if (!box || !barBox) throw new Error('timeline track or bar not found')

  // Drag right-to-left starting from within the bar (75% across it) so the total pointer movement
  // is -0.3*totalSec (totalSec=7 by default) regardless of exactly where startSec started.
  const y = barBox.y + barBox.height / 2
  const startX = barBox.x + barBox.width * 0.75
  await page.mouse.move(startX, y)
  await page.mouse.down()
  await page.mouse.move(startX - box.width * 0.15, y, { steps: 4 })
  await page.mouse.move(startX - box.width * 0.3, y, { steps: 4 })
  await page.mouse.up()

  await expect.poll(async () => (await getMarkers(page))[0].appear.startSec).not.toBe(originalStartSec)
  const [afterDrag] = await getMarkers(page)
  expect(afterDrag.appear.startSec).toBeCloseTo(originalStartSec - 0.3 * 7, 0)

  // A plain click (down+up at the same point, no movement) selects instead of repositioning —
  // the matching sidebar card gets a visible highlight (border/box-shadow using --accent).
  const markerSection = page.locator('details').filter({ has: page.locator('summary', { hasText: /^Marker$/ }) })
  const card = markerSection.locator('input[placeholder]').first().locator('xpath=ancestor::div[2]')
  const boxShadowBefore = await card.evaluate((el) => getComputedStyle(el).boxShadow)

  const barBoxAfterDrag = await bar.boundingBox()
  if (!barBoxAfterDrag) throw new Error('bar not found after drag')
  await bar.click({ position: { x: barBoxAfterDrag.width / 2, y: barBoxAfterDrag.height / 2 } })
  await expect(async () => {
    const boxShadowAfter = await card.evaluate((el) => getComputedStyle(el).boxShadow)
    expect(boxShadowAfter).not.toBe(boxShadowBefore)
    expect(boxShadowAfter).not.toBe('none')
  }).toPass()

  // The click-to-select must not have also repositioned the bar (startSec unchanged from the drag result).
  const [afterClick] = await getMarkers(page)
  expect(afterClick.appear.startSec).toBeCloseTo(afterDrag.appear.startSec, 6)
})

test('area pick queries Overpass, adds the area, and it survives a style change', async ({ page }) => {
  await gotoApp(page)

  await page.getByRole('radio', { name: 'Gebiet abfragen' }).click()
  await page.locator('canvas.maplibregl-canvas').click({ button: 'right', position: { x: 200, y: 150 } })

  // The real candidate survives the default settings filter…
  const candidate = page.getByText('Testgebiet — Schutzgebiet')
  await expect(candidate).toBeVisible()
  // …the timezone noise entry does not.
  await expect(page.getByText('UTC+01:00', { exact: false })).toHaveCount(0)

  await candidate.click()
  await page.getByRole('button', { name: 'Ausgewählte hinzufügen' }).click()
  await expect.poll(() => isAreaVisible(page)).toBe(true)

  // setStyle(diff:false) tears the map's layers down and rebuilds them —
  // the known pitfall this must survive, same as markers.
  await openSection(page, 'Aussehen')
  await page.selectOption('#mapStyle', 'dark')
  await page.waitForTimeout(300)
  await expect.poll(() => isAreaVisible(page)).toBe(true)
})

test('area pick hits the local database and never calls live Overpass', async ({ page }) => {
  const overpassRequests: string[] = []
  page.on('request', (req) => {
    if (req.url().includes('overpass-api.de')) overpassRequests.push(req.url())
  })

  await gotoApp(page, { localAreaHit: true })

  await page.getByRole('radio', { name: 'Gebiet abfragen' }).click()
  await page.locator('canvas.maplibregl-canvas').click({ button: 'right', position: { x: 200, y: 150 } })

  const candidate = page.getByText('Testgebiet — Schutzgebiet (lokale Datenbank)')
  await expect(candidate).toBeVisible()

  await candidate.click()
  await page.getByRole('button', { name: 'Ausgewählte hinzufügen' }).click()
  await expect.poll(() => isAreaVisible(page)).toBe(true)

  expect(overpassRequests).toEqual([])
})

test('route: multiple right-clicks set waypoints, calculating via OSRM renders the line, and it survives a style change', async ({
  page,
}) => {
  await gotoApp(page)

  await page.getByRole('radio', { name: 'Route planen' }).click()
  const canvas = page.locator('canvas.maplibregl-canvas')
  await canvas.click({ button: 'right', position: { x: 150, y: 120 } })
  await canvas.click({ button: 'right', position: { x: 200, y: 160 } })
  await canvas.click({ button: 'right', position: { x: 250, y: 130 } })

  // The waypoint list renders each label as a <span>, scoped to that tag.
  await openSection(page, 'Route')
  await expect(page.locator('span', { hasText: 'Start' })).toBeVisible()
  await expect(page.locator('span', { hasText: 'Zwischenstopp 1' })).toBeVisible()
  await expect(page.locator('span', { hasText: 'Ziel' })).toBeVisible()

  await page.getByRole('button', { name: 'Route berechnen' }).click()
  await expect.poll(() => isRouteVisible(page)).toBe(true)

  // setStyle(diff:false) tears the map's layers down and rebuilds them —
  // the known pitfall this must survive, same as markers/areas.
  await openSection(page, 'Aussehen')
  await page.selectOption('#mapStyle', 'dark')
  await page.waitForTimeout(300)
  await expect.poll(() => isRouteVisible(page)).toBe(true)
})

test('camera: right-clicks in camera mode append waypoints, and playback actually reaches the new one', async ({ page }) => {
  await gotoApp(page)

  await page.getByRole('radio', { name: 'Kameraflug planen' }).click()
  const canvas = page.locator('canvas.maplibregl-canvas')
  await canvas.click({ button: 'right', position: { x: 350, y: 200 } })
  await expect.poll(() => getCameraWaypoints(page)).toHaveLength(3) // 2 default + 1 added

  await expect(page.locator('[data-testid="camera-waypoint-2"]')).toBeVisible()
  await expect(page.locator('[data-testid="camera-waypoint-2"]').getByText('C', { exact: true })).toBeVisible()

  // Set the new (last) waypoint's hold long enough to sample it reliably mid-playback.
  await page.locator('[data-testid="camera-waypoint-2"]').getByLabel('Verweilzeit (s)').fill('2')
  await page.locator('[data-testid="camera-waypoint-2"]').getByLabel('Flugzeit (s)').fill('0.5')

  const [start, , added] = await getCameraWaypoints(page)
  await page.getByRole('button', { name: 'Vorschau abspielen' }).click()
  // Total duration is now 1 (hold A) + 4 (travel) + 2 (hold B) + 0.5 (travel) + 2 (hold C) = 9.5s.
  // Sample mid-way through C's hold (7.5s-9.5s) — playback must actually reach the appended
  // waypoint, not stop early or silently ignore it.
  await page.waitForTimeout(8500)
  const zr = await page.evaluate(() => window.__mapController?.toRef(window.__mapController.map.getZoom()))
  expect(zr).toBeGreaterThan(Math.min(start.zr, added.zr) - 0.5)
  expect(zr).toBeLessThan(Math.max(start.zr, added.zr) + 0.5)
})

test('route: straight-line mode renders without ever calling OSRM', async ({ page }) => {
  const osrmRequests: string[] = []
  page.on('request', (req) => {
    if (req.url().includes('router.project-osrm.org')) osrmRequests.push(req.url())
  })

  await gotoApp(page)

  await page.getByRole('radio', { name: 'Route planen' }).click()
  const canvas = page.locator('canvas.maplibregl-canvas')
  await canvas.click({ button: 'right', position: { x: 150, y: 120 } })
  await canvas.click({ button: 'right', position: { x: 250, y: 130 } })

  await openSection(page, 'Route')
  await page.getByRole('radio', { name: 'Luftlinie' }).click()
  await expect.poll(() => isRouteVisible(page)).toBe(true)

  expect(osrmRequests).toEqual([])
})

test('route: a third and fourth click insert before the destination, which stays last', async ({ page }) => {
  await gotoApp(page)

  await page.getByRole('radio', { name: 'Route planen' }).click()
  const canvas = page.locator('canvas.maplibregl-canvas')
  await canvas.click({ button: 'right', position: { x: 100, y: 100 } }) // 1: start
  await canvas.click({ button: 'right', position: { x: 200, y: 200 } }) // 2: destination
  await expect.poll(() => getRouteWaypoints(page)).toHaveLength(2)
  const [start, destination] = await getRouteWaypoints(page)

  await canvas.click({ button: 'right', position: { x: 150, y: 250 } }) // 3: should insert before destination
  await expect.poll(() => getRouteWaypoints(page)).toHaveLength(3)
  const afterThird = await getRouteWaypoints(page)
  expect(afterThird[0]).toEqual(start)
  expect(afterThird[2]).toEqual(destination) // destination is still last
  const thirdClickPoint = afterThird[1]

  await canvas.click({ button: 'right', position: { x: 250, y: 150 } }) // 4: should also insert before destination
  await expect.poll(() => getRouteWaypoints(page)).toHaveLength(4)
  const afterFourth = await getRouteWaypoints(page)
  expect(afterFourth[0]).toEqual(start)
  expect(afterFourth[1]).toEqual(thirdClickPoint) // earlier via-point keeps its place
  expect(afterFourth[3]).toEqual(destination) // destination is still last
})

test('route: dragging a segment boundary on the Timeline changes that leg\'s travelSec', async ({ page }) => {
  await gotoApp(page)

  await page.getByRole('radio', { name: 'Route planen' }).click()
  const canvas = page.locator('canvas.maplibregl-canvas')
  await canvas.click({ button: 'right', position: { x: 150, y: 120 } }) // start
  await canvas.click({ button: 'right', position: { x: 250, y: 160 } }) // destination
  await expect.poll(() => getRouteWaypoints(page)).toHaveLength(2)

  const [, destination] = await getRouteWaypoints(page)
  const originalTravelSec = destination.travelSec // createDefaultRouteWaypoint's default: 3

  const handle = page.locator(`[data-testid="route-boundary-${destination.id}-travel"]`)
  const handleBox = await handle.boundingBox()
  const trackBox = await page.locator('[data-testid="timeline-route-track"]').boundingBox()
  if (!handleBox || !trackBox) throw new Error('route boundary handle or track not found')

  // Default project totalSec is 7 (camera: 1 + 0 + 4 + 2). Drag the destination's travel-leg
  // boundary 10% of the track width to the right -> travelSec should grow by ~0.1 * 7 = 0.7s.
  const y = handleBox.y + handleBox.height / 2
  const startX = handleBox.x + handleBox.width / 2
  await page.mouse.move(startX, y)
  await page.mouse.down()
  await page.mouse.move(startX + trackBox.width * 0.1, y, { steps: 4 })
  await page.mouse.up()

  await expect.poll(async () => (await getRouteWaypoints(page))[1].travelSec).not.toBe(originalTravelSec)
  const [, afterDrag] = await getRouteWaypoints(page)
  expect(afterDrag.travelSec).toBeCloseTo(originalTravelSec + 0.1 * 7, 0)
})

test('route: a 0s hold is still independently draggable (regression: must not be masked by the adjacent travel handle)', async ({
  page,
}) => {
  await gotoApp(page)

  await page.getByRole('radio', { name: 'Route planen' }).click()
  const canvas = page.locator('canvas.maplibregl-canvas')
  await canvas.click({ button: 'right', position: { x: 150, y: 120 } }) // start (A)
  await canvas.click({ button: 'right', position: { x: 250, y: 160 } }) // destination (becomes C)
  await canvas.click({ button: 'right', position: { x: 200, y: 200 } }) // inserted before destination (B)
  await expect.poll(() => getRouteWaypoints(page)).toHaveLength(3)

  // Force the exact coincidence scenario: B's hold at 0s (waypoints default
  // to holdSec: 1 now, precisely so this doesn't happen by accident — but a
  // user can still explicitly set one to 0, and that must stay draggable).
  await openSection(page, 'Route')
  const [, waypointBBefore] = await getRouteWaypoints(page)
  await page.locator(`#routeHold-${waypointBBefore.id}`).fill('0')
  await expect.poll(async () => (await getRouteWaypoints(page))[1].holdSec).toBe(0)

  const [, waypointB] = await getRouteWaypoints(page)
  const originalHoldB = waypointB.holdSec // 0 — forced above, the value that used to make this handle unreachable
  const originalTravelB = waypointB.travelSec

  const holdHandle = page.locator(`[data-testid="route-boundary-${waypointB.id}-hold"]`)
  const travelHandle = page.locator(`[data-testid="route-boundary-${waypointB.id}-travel"]`)
  const holdBox = await holdHandle.boundingBox()
  const travelBox = await travelHandle.boundingBox()
  const trackBox = await page.locator('[data-testid="timeline-route-track"]').boundingBox()
  if (!holdBox || !travelBox || !trackBox) throw new Error('handles or track not found')

  // These two mathematically coincide (holdSec_B = 0) — the declutter fix must
  // still keep them apart, or one permanently masks the other.
  expect(Math.abs(holdBox.x - travelBox.x)).toBeGreaterThan(2)

  const y = holdBox.y + holdBox.height / 2
  const startX = holdBox.x + holdBox.width / 2
  await page.mouse.move(startX, y)
  await page.mouse.down()
  await page.mouse.move(startX + trackBox.width * 0.05, y, { steps: 4 })
  await page.mouse.up()

  await expect.poll(async () => (await getRouteWaypoints(page))[1].holdSec).not.toBe(originalHoldB)
  const afterDrag = (await getRouteWaypoints(page))[1]
  expect(afterDrag.holdSec).toBeCloseTo(originalHoldB + 0.05 * 7, 0)
  expect(afterDrag.travelSec).toBeCloseTo(originalTravelB, 6) // untouched — dragging hold must not affect travel
})

test('route: dragging the leading (pre-appear) handle changes appear.startSec, not any waypoint\'s own timing', async ({ page }) => {
  await gotoApp(page)

  await page.getByRole('radio', { name: 'Route planen' }).click()
  const canvas = page.locator('canvas.maplibregl-canvas')
  await canvas.click({ button: 'right', position: { x: 150, y: 120 } })
  await canvas.click({ button: 'right', position: { x: 250, y: 160 } })
  await expect.poll(() => getRouteWaypoints(page)).toHaveLength(2)

  const originalAppearStart = await getRouteAppearStartSec(page) // default 1
  const [start] = await getRouteWaypoints(page)
  const originalHoldA = start.holdSec
  const routeId = await getRouteId(page)

  const handle = page.locator(`[data-testid="route-boundary-${routeId}-appear"]`)
  const handleBox = await handle.boundingBox()
  const trackBox = await page.locator('[data-testid="timeline-route-track"]').boundingBox()
  if (!handleBox || !trackBox) throw new Error('appear handle or track not found')

  const y = handleBox.y + handleBox.height / 2
  const startX = handleBox.x + handleBox.width / 2
  await page.mouse.move(startX, y)
  await page.mouse.down()
  await page.mouse.move(startX + trackBox.width * 0.1, y, { steps: 4 })
  await page.mouse.up()

  await expect.poll(() => getRouteAppearStartSec(page)).not.toBe(originalAppearStart)
  const afterDrag = await getRouteAppearStartSec(page)
  expect(afterDrag).toBeCloseTo((originalAppearStart ?? 0) + 0.1 * 7, 0)

  const [startAfter] = await getRouteWaypoints(page)
  expect(startAfter.holdSec).toBeCloseTo(originalHoldA, 6) // untouched — only appear.startSec should move
})

test('camera: dragging a segment boundary on the Timeline changes that waypoint\'s holdSec, matching CameraPanel\'s own field', async ({
  page,
}) => {
  await gotoApp(page)

  // Nothing has triggered a setProject() yet, so localStorage (what
  // getCameraWaypoints reads) is still empty — the default project's first
  // waypoint's holdSec is a known constant (createDefaultProject's explicit
  // override), no need to round-trip through it before the first drag.
  const originalHoldFirst = 1
  const handle = page.locator('[data-testid^="camera-boundary-"][data-testid$="-hold"]').first()
  const handleBox = await handle.boundingBox()
  const trackBox = await page.locator('[data-testid="timeline-camera-track"]').boundingBox()
  if (!handleBox || !trackBox) throw new Error('camera boundary handle or track not found')

  const y = handleBox.y + handleBox.height / 2
  const startX = handleBox.x + handleBox.width / 2
  await page.mouse.move(startX, y)
  await page.mouse.down()
  await page.mouse.move(startX + trackBox.width * 0.1, y, { steps: 4 })
  await page.mouse.up()

  await expect.poll(async () => (await getCameraWaypoints(page))[0].holdSec).not.toBe(originalHoldFirst)
  const afterDrag = (await getCameraWaypoints(page))[0]
  expect(afterDrag.holdSec).toBeCloseTo(originalHoldFirst + 0.1 * 7, 0) // default totalSec is 7

  // The sidebar field must read back the exact same number the drag just wrote — single source of truth.
  await page.getByRole('radio', { name: 'Kameraflug planen' }).click()
  const sidebarValue = await page.locator('[data-testid="camera-waypoint-0"]').getByLabel('Verweilzeit (s)').inputValue()
  expect(Number(sidebarValue)).toBeCloseTo(afterDrag.holdSec, 6)
})

test('marker: dragging the fadeIn edge changes fadeInSec; unchecking hold-forever exposes hold/fadeOut edges too', async ({ page }) => {
  await gotoApp(page)

  await page.locator('canvas.maplibregl-canvas').click({ button: 'right', position: { x: 200, y: 150 } })
  const [marker] = await getMarkers(page)
  const originalFadeIn = marker.appear.fadeInSec // default 0.4

  const fadeInHandle = page.locator(`[data-testid="object-boundary-${marker.id}-fadeInSec"]`)
  const trackBox = await page.locator(`[data-testid="timeline-track-${marker.id}"]`).boundingBox()
  const fadeInBox = await fadeInHandle.boundingBox()
  if (!fadeInBox || !trackBox) throw new Error('fadeIn handle or track not found')

  const y = fadeInBox.y + fadeInBox.height / 2
  const startX = fadeInBox.x + fadeInBox.width / 2
  await page.mouse.move(startX, y)
  await page.mouse.down()
  await page.mouse.move(startX + trackBox.width * 0.05, y, { steps: 4 })
  await page.mouse.up()

  await expect.poll(async () => (await getMarkers(page))[0].appear.fadeInSec).not.toBe(originalFadeIn)
  const afterFadeInDrag = (await getMarkers(page))[0]
  expect(afterFadeInDrag.appear.fadeInSec).toBeCloseTo(originalFadeIn + 0.05 * 7, 0)
  expect(afterFadeInDrag.appear.startSec).toBeCloseTo(marker.appear.startSec, 6) // untouched — dragging fadeIn must not reposition the bar

  // Hold/fadeOut handles don't exist yet (hold-forever is on by default).
  await expect(page.locator(`[data-testid="object-boundary-${marker.id}-holdSec"]`)).toHaveCount(0)

  // Uncheck "hold forever" -> a finite hold + fadeOut now exist and should be draggable too.
  await openSection(page, 'Marker')
  await page.getByLabel('Bis zum Ende sichtbar bleiben').uncheck()
  await expect.poll(async () => (await getMarkers(page))[0].appear.holdSec).not.toBeUndefined()

  const holdHandle = page.locator(`[data-testid="object-boundary-${marker.id}-holdSec"]`)
  await expect(holdHandle).toBeVisible()
  const [markerWithHold] = await getMarkers(page)
  const originalHold = markerWithHold.appear.holdSec as number

  const holdBox = await holdHandle.boundingBox()
  if (!holdBox) throw new Error('hold handle not found')
  const holdY = holdBox.y + holdBox.height / 2
  const holdStartX = holdBox.x + holdBox.width / 2
  // Drag left, not right: startSec(5) + fadeInSec(0.4) + holdSec(2) = 7.4s
  // already exceeds the default totalSec (7), so this handle's position is
  // clamped at the track's right edge — dragging further right has no room
  // to move (fracX is already saturated at 1). Left has room to shrink.
  await page.mouse.move(holdStartX, holdY)
  await page.mouse.down()
  await page.mouse.move(holdStartX - trackBox.width * 0.05, holdY, { steps: 4 })
  await page.mouse.up()

  await expect.poll(async () => (await getMarkers(page))[0].appear.holdSec).not.toBe(originalHold)
})

test('preview runs and advances the time readout', async ({ page }) => {
  await gotoApp(page)
  await page.getByRole('radio', { name: 'Kameraflug planen' }).click()

  await page.locator('[data-testid="camera-waypoint-0"]').getByLabel('Verweilzeit (s)').fill('0.2')
  await page.locator('[data-testid="camera-waypoint-1"]').getByLabel('Flugzeit (s)').fill('0.5')
  await page.locator('[data-testid="camera-waypoint-1"]').getByLabel('Verweilzeit (s)').fill('0.2')
  const timeReadout = page.locator('text=/\\d,\\d \\/ 0,9 s/')

  await expect(timeReadout).toHaveText('0,0 / 0,9 s')
  await page.getByRole('button', { name: 'Vorschau abspielen' }).click()
  await expect(page.getByRole('button', { name: 'Vorschau stoppen' })).toBeVisible()

  // Time should move past 0,0 while playing…
  await expect.poll(() => timeReadout.textContent()).not.toBe('0,0 / 0,9 s')
  // …and playback should stop on its own once it reaches the total duration.
  await expect(page.getByRole('button', { name: 'Vorschau abspielen' })).toBeVisible({ timeout: 5000 })
  await expect(timeReadout).toHaveText('0,9 / 0,9 s')
})

test('mp4 export produces a valid file with the correct frame count', async ({ page }) => {
  await gotoApp(page)
  await page.getByRole('radio', { name: 'Kameraflug planen' }).click()

  const holdStart = 0.2
  const zoomDuration = 0.5 // >= the 0.5s minimum camera.ts clamps travel legs to
  const holdEnd = 0.2
  await page.locator('[data-testid="camera-waypoint-0"]').getByLabel('Verweilzeit (s)').fill(String(holdStart))
  await page.locator('[data-testid="camera-waypoint-1"]').getByLabel('Flugzeit (s)').fill(String(zoomDuration))
  await page.locator('[data-testid="camera-waypoint-1"]').getByLabel('Verweilzeit (s)').fill(String(holdEnd))
  await openSection(page, 'Export')
  const fps = 24
  await page.selectOption('#exportFps', String(fps))

  const downloadPromise = page.waitForEvent('download', { timeout: 60_000 })
  await page.getByRole('button', { name: 'Exportieren' }).click()
  const download = await downloadPromise
  const filePath = await download.path()
  expect(filePath).toBeTruthy()
  if (!filePath) return

  const expectedFrames = Math.max(1, Math.round((holdStart + zoomDuration + holdEnd) * fps))

  try {
    const { stdout } = await execFileAsync('ffprobe', [
      '-v',
      'error',
      '-count_frames',
      '-select_streams',
      'v:0',
      '-show_entries',
      'stream=nb_read_frames',
      '-of',
      'csv=p=0',
      filePath,
    ])
    expect(Number(stdout.trim())).toBe(expectedFrames)
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
    // ffprobe not installed on this machine — fall back to a basic sanity check.
    expect(statSync(filePath).size).toBeGreaterThan(1000)
  }
})

test('project: reset clears markers/areas/route and restores the default camera, after confirming', async ({ page }) => {
  await gotoApp(page)

  await page.locator('canvas.maplibregl-canvas').click({ button: 'right', position: { x: 200, y: 150 } })
  await expect.poll(() => markerDotCount(page)).toBe(1)

  await page.getByRole('radio', { name: 'Route planen' }).click()
  const canvas = page.locator('canvas.maplibregl-canvas')
  await canvas.click({ button: 'right', position: { x: 150, y: 120 } })
  await canvas.click({ button: 'right', position: { x: 250, y: 130 } })
  await expect.poll(() => getRouteWaypoints(page)).toHaveLength(2)

  await page.getByRole('radio', { name: 'Kameraflug planen' }).click()
  await canvas.click({ button: 'right', position: { x: 300, y: 300 } })
  await expect.poll(() => getCameraWaypoints(page)).toHaveLength(3)

  await page.getByRole('radio', { name: 'Gebiet abfragen' }).click()
  await canvas.click({ button: 'right', position: { x: 200, y: 150 } })
  await page.getByText('Testgebiet — Schutzgebiet').click()
  await page.getByRole('button', { name: 'Ausgewählte hinzufügen' }).click()
  await expect.poll(() => isAreaVisible(page)).toBe(true)

  // Dismissing the confirm dialog must leave everything untouched.
  await openSection(page, 'Projekt')
  page.once('dialog', (dialog) => dialog.dismiss())
  await page.getByRole('button', { name: 'Projekt zurücksetzen' }).click()
  await page.waitForTimeout(150)
  expect(await markerDotCount(page)).toBe(1)
  expect(await getCameraWaypoints(page)).toHaveLength(3)
  expect(await isAreaVisible(page)).toBe(true)

  // Accepting it clears markers/areas/route and restores the 2-waypoint default camera —
  // and must actually remove the area's map layers, not just the project state (the same
  // stale-layer gap that was already fixed for markers in PR #6, extended here to areas).
  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: 'Projekt zurücksetzen' }).click()
  await expect.poll(() => markerDotCount(page)).toBe(0)
  await expect.poll(() => getRouteWaypoints(page)).toEqual([])
  await expect.poll(() => getCameraWaypoints(page)).toHaveLength(2)
  await expect.poll(() => isAreaVisible(page)).toBe(false)
})
