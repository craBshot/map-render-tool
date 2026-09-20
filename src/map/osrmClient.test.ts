import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchRoute } from './osrmClient'
import type { RouteWaypoint } from '../state/types'

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return { ok, status, json: async () => body } as unknown as Response
}

function wp(id: string, lng: number, lat: number): RouteWaypoint {
  return { id, lng, lat, holdSec: 0, travelSec: 3 }
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

    const result = await fetchRoute([wp('a', 13.38882, 52.517034), wp('b', 13.3888, 52.517147)])

    expect(result.geometry).toEqual(realShapedResponse.routes[0].geometry)
    expect(result.durationSec).toBe(260.4)
    expect(result.legDistancesM).toEqual([1888])
  })

  it('builds a semicolon-separated lng,lat coordinate list in the URL for multiple waypoints, always via driving', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(jsonResponse(realShapedResponse))
    vi.stubGlobal('fetch', fetchSpy)

    await fetchRoute([wp('a', 13.4, 52.5), wp('b', 13.42, 52.5), wp('c', 13.397634, 52.529407)])

    const url = fetchSpy.mock.calls[0][0] as string
    expect(url).toContain('/route/v1/driving/13.4,52.5;13.42,52.5;13.397634,52.529407')
    expect(url).toContain('geometries=geojson')
    expect(url).toContain('overview=full')
  })

  it('throws for a non-2xx HTTP response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({}, false, 503)))

    await expect(fetchRoute([wp('a', 0, 0), wp('b', 1, 1)])).rejects.toThrow('503')
  })

  it('throws when OSRM reports a non-Ok code (e.g. no route found)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ code: 'NoRoute' })))

    await expect(fetchRoute([wp('a', 0, 0), wp('b', 1, 1)])).rejects.toThrow('NoRoute')
  })
})
