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

// Candidate list for the is_in()/out tags; query — one real candidate plus
// one noise category (timezone) that should be filtered out by default.
const MOCK_OVERPASS_CANDIDATES = {
  elements: [
    { type: 'way', id: 42, tags: { name: 'Testgebiet', boundary: 'protected_area' } },
    { type: 'relation', id: 99, tags: { name: 'UTC+01:00 standard time', boundary: 'timezone' } },
  ],
}

// Geometry for the out geom; query on the picked way — a small closed square.
const MOCK_OVERPASS_GEOMETRY = {
  elements: [
    {
      type: 'way',
      id: 42,
      tags: { name: 'Testgebiet', boundary: 'protected_area' },
      geometry: [
        { lat: 50, lon: 9 },
        { lat: 50, lon: 9.01 },
        { lat: 50.01, lon: 9.01 },
        { lat: 50.01, lon: 9 },
        { lat: 50, lon: 9 },
      ],
    },
  ],
}

export async function mockExternalServices(page: Page): Promise<void> {
  await page.route('**/tiles.openfreemap.org/**', (route) =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify(MOCK_STYLE) }),
  )
  await page.route('**/nominatim.openstreetmap.org/**', (route) =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify(MOCK_NOMINATIM_RESULT) }),
  )
  await page.route('**/overpass-api.de/**', (route) => {
    // postData() is the raw (still URL-encoded) body — decode before matching,
    // otherwise "out geom" never matches its "out%20geom" wire form.
    const body = decodeURIComponent(route.request().postData() ?? '')
    const mock = body.includes('out geom') ? MOCK_OVERPASS_GEOMETRY : MOCK_OVERPASS_CANDIDATES
    route.fulfill({ contentType: 'application/json', body: JSON.stringify(mock) })
  })
}
