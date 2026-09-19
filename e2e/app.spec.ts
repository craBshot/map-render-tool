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
async function getRouteWaypoints(page: import('@playwright/test').Page): Promise<{ lng: number; lat: number }[]> {
  return page.evaluate(() => {
    const raw = localStorage.getItem('map-render-tool:project')
    if (!raw) return []
    return JSON.parse(raw).route?.waypoints ?? []
  })
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

  await page.getByRole('button', { name: '✕' }).first().click()
  await expect.poll(() => markerDotCount(page)).toBe(1)

  // The deleted marker's halo layer (and source) must be gone too, not just its dot —
  // regression guard for MapController.removeStaleMarkerLayers.
  const remainingMarkerLayers = await page.evaluate(() => {
    const controller = window.__mapController
    if (!controller) return -1
    return controller.map.getStyle().layers.filter((l) => l.id.startsWith('marker-')).length
  })
  expect(remainingMarkerLayers).toBe(2) // one remaining marker × (halo + dot)
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

  // The waypoint list renders each label as a <span> — scope to that tag,
  // since "Start"/"Ziel" alone also match the camera panel's point labels.
  await expect(page.locator('span', { hasText: 'Start' })).toBeVisible()
  await expect(page.locator('span', { hasText: 'Zwischenstopp 1' })).toBeVisible()
  await expect(page.locator('span', { hasText: 'Ziel' })).toBeVisible()

  await page.getByRole('button', { name: 'Route berechnen' }).click()
  await expect.poll(() => isRouteVisible(page)).toBe(true)

  // setStyle(diff:false) tears the map's layers down and rebuilds them —
  // the known pitfall this must survive, same as markers/areas.
  await page.selectOption('#mapStyle', 'dark')
  await page.waitForTimeout(300)
  await expect.poll(() => isRouteVisible(page)).toBe(true)
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

test('preview runs and advances the time readout', async ({ page }) => {
  await gotoApp(page)

  await page.fill('#holdStart', '0.2')
  await page.fill('#zoomDuration', '0.5')
  await page.fill('#holdEnd', '0.2')
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

  const holdStart = 0.2
  const zoomDuration = 0.5 // >= the 0.5s minimum timingTotals() clamps to
  const holdEnd = 0.2
  await page.fill('#holdStart', String(holdStart))
  await page.fill('#zoomDuration', String(zoomDuration))
  await page.fill('#holdEnd', String(holdEnd))
  const fps = 24
  await page.selectOption('#exportFps', String(fps))

  const downloadPromise = page.waitForEvent('download', { timeout: 60_000 })
  await page.getByRole('button', { name: 'Exportieren' }).click()
  const download = await downloadPromise
  const filePath = await download.path()
  expect(filePath).toBeTruthy()
  if (!filePath) return

  const expectedFrames =
    Math.round(holdStart * fps) + Math.max(2, Math.round(zoomDuration * fps)) + Math.round(holdEnd * fps)

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
