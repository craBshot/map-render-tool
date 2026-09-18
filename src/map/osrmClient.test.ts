import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchRoute } from './osrmClient'

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return { ok, status, json: async () => body } as unknown as Response
}

// Shape captured live from https://router.project-osrm.org during planning.
const realShapedResponse = {
  code: 'Ok',
  waypoints: [{ location: [13.38882, 52.517034], name: 'Friedrichstraße', distance: 2.7, hint: 'x' }],
  routes: [
    {
      legs: [{ steps: [], weight: 262.7, summary: '', duration: 260.4, distance: 1888 }],
      weight_name: 'routability',
      geometry: {
        type: 'LineString',
        coordinates: [
          [13.38882, 52.517034],
          [13.3888, 52.517147],
        ],
      },
      weight: 262.7,
      duration: 260.4,
      distance: 1888,
    },
  ],
}

describe('fetchRoute', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns the geometry and duration on success', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(realShapedResponse)))

    const result = await fetchRoute([
      { lng: 13.38882, lat: 52.517034 },
      { lng: 13.3888, lat: 52.517147 },
    ])

    expect(result.geometry).toEqual(realShapedResponse.routes[0].geometry)
    expect(result.durationSec).toBe(260.4)
  })

  it('builds a semicolon-separated lng,lat coordinate list in the URL for multiple waypoints, always via driving', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(jsonResponse(realShapedResponse))
    vi.stubGlobal('fetch', fetchSpy)

    await fetchRoute([
      { lng: 13.4, lat: 52.5 },
      { lng: 13.42, lat: 52.5 },
      { lng: 13.397634, lat: 52.529407 },
    ])

    const url = fetchSpy.mock.calls[0][0] as string
    expect(url).toContain('/route/v1/driving/13.4,52.5;13.42,52.5;13.397634,52.529407')
    expect(url).toContain('geometries=geojson')
    expect(url).toContain('overview=full')
  })

  it('throws for a non-2xx HTTP response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({}, false, 503)))

    await expect(fetchRoute([{ lng: 0, lat: 0 }, { lng: 1, lat: 1 }])).rejects.toThrow('503')
  })

  it('throws when OSRM reports a non-Ok code (e.g. no route found)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ code: 'NoRoute' })))

    await expect(fetchRoute([{ lng: 0, lat: 0 }, { lng: 1, lat: 1 }])).rejects.toThrow('NoRoute')
  })
})
