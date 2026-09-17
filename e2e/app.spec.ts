import { execFile } from 'node:child_process'
import { statSync } from 'node:fs'
import { promisify } from 'node:util'
import { expect, test } from '@playwright/test'
import { mockExternalServices } from './fixtures/routeMocks'

const execFileAsync = promisify(execFile)

async function gotoApp(page: import('@playwright/test').Page) {
  await page.addInitScript(() => {
    window.__E2E__ = true
  })
  await mockExternalServices(page)
  await page.goto('/')
  await page.locator('canvas.maplibregl-canvas').waitFor()
}

/** True if the marker's dot layer exists and is not hidden. */
async function isMarkerVisible(page: import('@playwright/test').Page): Promise<boolean> {
  return page.evaluate(() => {
    const controller = window.__mapController
    if (!controller) return false
    const dotLayer = controller.map.getStyle().layers.find((l) => l.id.endsWith('-dot'))
    if (!dotLayer) return false
    return controller.map.getLayoutProperty(dotLayer.id, 'visibility') !== 'none'
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

test('right-click sets the marker, and it stays visible after a style change', async ({ page }) => {
  await gotoApp(page)

  await page.locator('canvas.maplibregl-canvas').click({ button: 'right', position: { x: 200, y: 150 } })
  await expect.poll(() => isMarkerVisible(page)).toBe(true)

  // setStyle(diff:false) tears the map's layers down and rebuilds them —
  // the known pitfall this must survive.
  await page.selectOption('#mapStyle', 'dark')
  await page.waitForTimeout(300)
  await expect.poll(() => isMarkerVisible(page)).toBe(true)
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
