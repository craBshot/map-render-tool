import type { MapController } from '../src/map/MapController'

declare global {
  interface Window {
    __E2E__?: boolean
    __mapController?: MapController
  }
}

export {}
