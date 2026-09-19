import { createServer, type Server, type ServerResponse } from 'node:http'
import type { LocalAreaKind } from '../src/map/overpassEnumeration.ts'
import { queryPoint } from './spatialIndex.ts'
import { readRawGeometry } from './manifestStore.ts'
import type { WorkerState } from './fetchLoop.ts'

const VALID_KINDS: ReadonlySet<LocalAreaKind> = new Set([
  'administrative',
  'protected_area',
  'national_park',
  'nature_reserve',
])

function isLocalAreaKind(value: string): value is LocalAreaKind {
  return VALID_KINDS.has(value as LocalAreaKind)
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(JSON.stringify(body))
}

/**
 * The local read API nginx proxies at /area-db/*. `getState` is a thunk
 * rather than a snapshot so every request sees the fetch loop's latest data
 * without the server needing to know when it changes.
 */
export function createAreaDbServer(getState: () => WorkerState, dataDir: string): Server {
  return createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://internal')

      if (url.pathname === '/candidates') {
        const lng = Number(url.searchParams.get('lng'))
        const lat = Number(url.searchParams.get('lat'))
        if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
          sendJson(res, 400, { error: 'lng and lat query parameters are required' })
          return
        }

        const kindsParam = url.searchParams.get('kinds')
        const kinds = kindsParam ? new Set(kindsParam.split(',').filter(isLocalAreaKind)) : undefined

        const areas = await queryPoint(getState().index, lng, lat, (entry) => readRawGeometry(dataDir, entry), kinds)
        sendJson(res, 200, { areas })
        return
      }

      if (url.pathname === '/status') {
        const { queue } = getState()
        const countries = Object.values(queue.countries)
        const items = Object.values(queue.items)
        sendJson(res, 200, {
          bootstrapped: queue.bootstrapped,
          countries: countries.length,
          countriesEnumerated: countries.filter((c) => c.enumerated).length,
          itemsTotal: items.length,
          itemsDone: items.filter((i) => i.status === 'done').length,
          consecutiveTickFailures: queue.consecutiveTickFailures,
        })
        return
      }

      sendJson(res, 404, { error: 'not found' })
    } catch (err) {
      sendJson(res, 500, { error: String(err) })
    }
  })
}
