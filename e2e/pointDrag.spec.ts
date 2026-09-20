import { expect, test } from '@playwright/test'
import { mockExternalServices } from './fixtures/routeMocks'

async function gotoApp(page: import('@playwright/test').Page): Promise<void> {
  await page.addInitScript(() => {
    window.__E2E__ = true
  })
  await mockExternalServices(page)
  await page.goto('/')
  await page.locator('canvas.maplibregl-canvas').waitFor()
}

async function getMarkers(page: import('@playwright/test').Page): Promise<{ id: string; lng: number; lat: number }[]> {
  return page.evaluate(() => {
    const raw = localStorage.getItem('map-render-tool:project')
    if (!raw) return []
    return JSON.parse(raw).markers.map((m: { id: string; lng: number; lat: number }) => ({ id: m.id, lng: m.lng, lat: m.lat }))
  })
}

async function getCameraWaypoints(page: import('@playwright/test').Page): Promise<{ id: string; lng: number; lat: number }[]> {
  return page.evaluate(() => {
    const raw = localStorage.getItem('map-render-tool:project')
    if (!raw) return []
    return JSON.parse(raw).camera.waypoints
  })
}

async function getRouteWaypoints(page: import('@playwright/test').Page): Promise<{ id: string; lng: number; lat: number }[]> {
  return page.evaluate(() => {
    const raw = localStorage.getItem('map-render-tool:project')
    if (!raw) return []
    return JSON.parse(raw).route?.waypoints ?? []
  })
}

async function isRouteVisible(page: import('@playwright/test').Page): Promise<boolean> {
  return page.evaluate(() => {
    const controller = window.__mapController
    if (!controller) return false
    const lineLayer = controller.map.getStyle().layers.find((l) => l.id === 'route-line-layer')
    if (!lineLayer) return false
    return controller.map.getLayoutProperty(lineLayer.id, 'visibility') !== 'none'
  })
}

async function getMapCenter(page: import('@playwright/test').Page): Promise<{ lng: number; lat: number }> {
  return page.evaluate(() => {
    const c = window.__mapController!.map.getCenter()
    return { lng: c.lng, lat: c.lat }
  })
}

/**
 * Absolute page pixel for a given lng/lat, projected through the CURRENT map
 * view/canvas position. Placing a point re-renders the sidebar (a new card
 * appears), which can reflow/resize the map's own container — so a pixel
 * offset computed against an earlier canvas.boundingBox() can silently drift
 * from where a point now actually sits on screen. Re-deriving the pixel from
 * the map's own live projection, right before each interaction, sidesteps
 * that drift instead of assuming any particular layout is stable.
 */
async function pagePointFor(page: import('@playwright/test').Page, lng: number, lat: number): Promise<{ x: number; y: number }> {
  const box = await page.locator('canvas.maplibregl-canvas').boundingBox()
  if (!box) throw new Error('canvas not found')
  const proj = await page.evaluate(([lng, lat]) => {
    const p = window.__mapController!.map.project([lng, lat])
    return { x: p.x, y: p.y }
  }, [lng, lat] as [number, number])
  return { x: box.x + proj.x, y: box.y + proj.y }
}

/** Left-drag between two absolute page pixels, via raw mouse events (a MapLibre canvas gesture, not HTML5 drag-and-drop). */
async function dragBetween(page: import('@playwright/test').Page, from: { x: number; y: number }, to: { x: number; y: number }): Promise<void> {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(to.x, to.y, { steps: 8 })
  await page.mouse.up()
}

test('marker drag moves it and suppresses native map pan', async ({ page }) => {
  await gotoApp(page)
  const canvas = page.locator('canvas.maplibregl-canvas')
  await canvas.click({ button: 'right', position: { x: 200, y: 150 } })
  const [before] = await getMarkers(page)
  const centerBefore = await getMapCenter(page)

  const from = await pagePointFor(page, before.lng, before.lat)
  await dragBetween(page, from, { x: from.x + 60, y: from.y + 40 })

  await expect.poll(async () => (await getMarkers(page))[0].lng).not.toBe(before.lng)
  const [after] = await getMarkers(page)
  expect(after.lat).not.toBe(before.lat)

  const centerAfter = await getMapCenter(page)
  expect(centerAfter.lng).toBeCloseTo(centerBefore.lng, 6)
  expect(centerAfter.lat).toBeCloseTo(centerBefore.lat, 6)
})

test("mode-scoping: a marker isn't draggable in Route mode, so the gesture pans the map instead", async ({ page }) => {
  await gotoApp(page)
  const canvas = page.locator('canvas.maplibregl-canvas')
  await canvas.click({ button: 'right', position: { x: 200, y: 150 } }) // placed while in default 'marker' mode
  const [before] = await getMarkers(page)

  await page.getByRole('radio', { name: 'Route planen' }).click()
  const centerBefore = await getMapCenter(page)
  const from = await pagePointFor(page, before.lng, before.lat) // starts exactly on the marker
  await dragBetween(page, from, { x: from.x + 60, y: from.y + 40 })

  const [after] = await getMarkers(page)
  expect(after.lng).toBe(before.lng)
  expect(after.lat).toBe(before.lat)

  // The gesture must have fallen through to native dragPan instead — proves hit-testing
  // correctly ignored the marker while in Route mode, rather than silently doing nothing.
  const centerAfter = await getMapCenter(page)
  expect(centerAfter.lng).not.toBeCloseTo(centerBefore.lng, 6)
})

test('camera waypoint drag moves it and suppresses native map pan', async ({ page }) => {
  await gotoApp(page)
  await page.getByRole('radio', { name: 'Kameraflug planen' }).click()
  const canvas = page.locator('canvas.maplibregl-canvas')
  await canvas.click({ button: 'right', position: { x: 350, y: 200 } }) // 3rd waypoint, away from the 2 defaults
  await expect.poll(() => getCameraWaypoints(page)).toHaveLength(3)
  const [, , added] = await getCameraWaypoints(page)
  const centerBefore = await getMapCenter(page)

  const from = await pagePointFor(page, added.lng, added.lat)
  await dragBetween(page, from, { x: from.x + 70, y: from.y + 50 })

  const afterDrag = (await getCameraWaypoints(page)).find((w) => w.id === added.id)!
  expect(afterDrag.lng).not.toBe(added.lng)
  const centerAfter = await getMapCenter(page)
  expect(centerAfter.lng).toBeCloseTo(centerBefore.lng, 6)
  expect(centerAfter.lat).toBeCloseTo(centerBefore.lat, 6)
})

test('dragging a route waypoint near a marker snaps exactly onto it', async ({ page }) => {
  await gotoApp(page)
  const canvas = page.locator('canvas.maplibregl-canvas')
  await canvas.click({ button: 'right', position: { x: 200, y: 150 } }) // marker
  const [marker] = await getMarkers(page)

  await page.getByRole('radio', { name: 'Route planen' }).click()
  await canvas.click({ button: 'right', position: { x: 350, y: 300 } }) // route waypoint, far from the marker
  const [routeWpBefore] = await getRouteWaypoints(page)

  const from = await pagePointFor(page, routeWpBefore.lng, routeWpBefore.lat)
  const target = await pagePointFor(page, marker.lng, marker.lat)
  // A few px off the marker's own exact pixel, not landing on the identical pixel — otherwise
  // unproject(project(marker)) could coincidentally reproduce marker's exact lng/lat regardless
  // of whether real cross-type snapping fired (see the same-type test's comment for why).
  const to = { x: target.x + 4, y: target.y + 3 }
  await dragBetween(page, from, to)

  const [routeWpAfter] = await getRouteWaypoints(page)
  expect(routeWpAfter.id).toBe(routeWpBefore.id)
  expect(routeWpAfter.lng).toBe(marker.lng)
  expect(routeWpAfter.lat).toBe(marker.lat)
})

test('two route waypoints dragged close together never snap onto each other (same type never snaps)', async ({ page }) => {
  await gotoApp(page)
  await page.getByRole('radio', { name: 'Route planen' }).click()
  const canvas = page.locator('canvas.maplibregl-canvas')
  await canvas.click({ button: 'right', position: { x: 150, y: 120 } })
  await canvas.click({ button: 'right', position: { x: 350, y: 300 } })
  const [first, second] = await getRouteWaypoints(page)

  const from = await pagePointFor(page, first.lng, first.lat)
  const target = await pagePointFor(page, second.lng, second.lat)
  // A few px off the second waypoint's own exact pixel (not landing on the identical pixel it
  // was placed at) — well within what would be the cross-type snap radius, to actually exercise
  // "is this treated as a snap candidate", not just "did two independent placements coincide".
  const to = { x: target.x + 4, y: target.y + 3 }
  await dragBetween(page, from, to)

  const after = await getRouteWaypoints(page)
  const draggedAfter = after.find((w) => w.id === first.id)!
  const otherAfter = after.find((w) => w.id === second.id)!
  expect(draggedAfter.lng !== otherAfter.lng || draggedAfter.lat !== otherAfter.lat).toBe(true)
})

test('right-click placement also snaps onto an existing different-type point', async ({ page }) => {
  await gotoApp(page)
  await page.getByRole('radio', { name: 'Kameraflug planen' }).click()
  const canvas = page.locator('canvas.maplibregl-canvas')
  await canvas.click({ button: 'right', position: { x: 300, y: 220 } })
  const cameraWaypoints = await getCameraWaypoints(page)
  const added = cameraWaypoints[cameraWaypoints.length - 1]

  await page.getByRole('radio', { name: 'Marker setzen' }).click()
  const near = await pagePointFor(page, added.lng, added.lat)
  await page.mouse.click(near.x + 2, near.y + 2, { button: 'right' }) // a couple px away, well within snap radius

  const [marker] = await getMarkers(page)
  expect(marker.lng).toBe(added.lng)
  expect(marker.lat).toBe(added.lat)
})

test('dragging a route waypoint never calls OSRM, even in osrm routing mode', async ({ page }) => {
  const osrmRequests: string[] = []
  page.on('request', (req) => {
    if (req.url().includes('router.project-osrm.org')) osrmRequests.push(req.url())
  })

  await gotoApp(page)
  await page.getByRole('radio', { name: 'Route planen' }).click()
  const canvas = page.locator('canvas.maplibregl-canvas')
  await canvas.click({ button: 'right', position: { x: 150, y: 120 } })
  await canvas.click({ button: 'right', position: { x: 350, y: 300 } })

  // Default routingMode is 'osrm' — "Route berechnen" fires the one expected request.
  await page.getByRole('button', { name: 'Route berechnen' }).click()
  await expect.poll(() => isRouteVisible(page)).toBe(true)
  expect(osrmRequests.length).toBe(1)

  osrmRequests.length = 0
  const [wp1] = await getRouteWaypoints(page)
  const from = await pagePointFor(page, wp1.lng, wp1.lat)
  await dragBetween(page, from, { x: from.x + 40, y: from.y + 30 })

  expect(osrmRequests).toEqual([]) // dragging must never trigger a new OSRM request (fair-use)
})
