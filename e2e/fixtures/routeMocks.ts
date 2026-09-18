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

// What the local area-db worker's /area-db/candidates would return for a hit —
// geometry included inline, unlike the two-step live Overpass path.
const MOCK_LOCAL_AREA_HIT = {
  areas: [
    {
      osmType: 'way',
      osmId: 42,
      name: 'Testgebiet',
      kind: 'protected_area',
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [9, 50],
            [9.01, 50],
            [9.01, 50.01],
            [9, 50.01],
            [9, 50],
          ],
        ],
      },
    },
  ],
}

// A small OSRM /route/v1/ response shape — one combined LineString, matching
// what geometries=geojson&overview=full actually returns (verified live
// against router.project-osrm.org during planning).
const MOCK_OSRM_RESPONSE = {
  code: 'Ok',
  routes: [
    {
      geometry: {
        type: 'LineString',
        coordinates: [
          [9, 50],
          [9.2, 50.1],
          [9.4, 50.3],
        ],
      },
      duration: 1234.5,
    },
  ],
}

export interface MockExternalServicesOptions {
  /** true = /area-db/candidates returns a hit; false (default) = empty, so the live Overpass path is exercised. */
  localAreaHit?: boolean
}

export async function mockExternalServices(page: Page, options: MockExternalServicesOptions = {}): Promise<void> {
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
  await page.route('**/area-db/**', (route) => {
    const body = options.localAreaHit ? MOCK_LOCAL_AREA_HIT : { areas: [] }
    route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) })
  })
  await page.route('**/router.project-osrm.org/**', (route) =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify(MOCK_OSRM_RESPONSE) }),
  )
}
