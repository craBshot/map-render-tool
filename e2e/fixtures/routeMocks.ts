import type { Page } from '@playwright/test'

// Deliberately minimal: no vector source, no sprite/glyphs. Rendering the
// real basemap is MapLibre's job (well-tested upstream); these tests only
// care about our own marker/style/export logic, which doesn't depend on
// basemap content.
const MOCK_STYLE = {
  version: 8,
  name: 'mock',
  sources: {},
  layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#e6ebee' } }],
}

const MOCK_NOMINATIM_RESULT = [
  {
    display_name: 'Testort, Testregion, Testland',
    boundingbox: ['50.0', '51.0', '9.0', '10.0'],
  },
]

export async function mockExternalServices(page: Page): Promise<void> {
  await page.route('**/tiles.openfreemap.org/**', (route) =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify(MOCK_STYLE) }),
  )
  await page.route('**/nominatim.openstreetmap.org/**', (route) =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify(MOCK_NOMINATIM_RESULT) }),
  )
}
