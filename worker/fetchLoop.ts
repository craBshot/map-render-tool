import { join } from 'node:path'
import { fetchAreaGeometry, postOverpassQuery, type OverpassCandidate } from '../src/map/overpassClient.ts'
import {
  buildCountryBootstrapQuery,
  buildCountryEnumerationQuery,
  parseCountryBootstrapResponse,
  parseEnumerationResponse,
} from '../src/map/overpassEnumeration.ts'
import type { OverpassRawTagElement } from '../src/map/overpassClient.ts'
import {
  addItems,
  applyBootstrap,
  itemKey,
  markCountryEnumerated,
  markCountryEnumerationFailed,
  markItemDone,
  markItemFailed,
  pickNextWork,
  recordTickResult,
  type QueueState,
} from './queueLogic.ts'
import { loadQueueState, saveQueueState } from './queueStore.ts'
import { readManifest, storeArea, type ManifestEntry } from './manifestStore.ts'
import { buildSpatialIndex, type SpatialIndex } from './spatialIndex.ts'
import { EUROPE_ISO2 } from './countries.ts'
import { HOME_COUNTRY_ISO2 } from './config.ts'

export interface WorkerState {
  queue: QueueState
  manifest: ManifestEntry[]
  index: SpatialIndex
}

function progressPath(dataDir: string): string {
  return join(dataDir, 'progress.json')
}

export async function loadInitialState(dataDir: string): Promise<WorkerState> {
  const queue = await loadQueueState(progressPath(dataDir))
  const manifest = await readManifest(dataDir)
  return { queue, manifest, index: buildSpatialIndex(manifest) }
}

async function persistAndReturn(dataDir: string, state: WorkerState, queue: QueueState): Promise<WorkerState> {
  await saveQueueState(progressPath(dataDir), queue)
  return { ...state, queue }
}

/** One unit of background work: bootstrap countries, enumerate one country, or fetch one item's geometry. */
export async function runTick(dataDir: string, state: WorkerState): Promise<WorkerState> {
  const nowIso = new Date().toISOString()

  try {
    if (!state.queue.bootstrapped) {
      const elements = await postOverpassQuery<OverpassRawTagElement>(buildCountryBootstrapQuery())
      const countries = parseCountryBootstrapResponse(elements)
      const queue = recordTickResult(applyBootstrap(state.queue, countries, EUROPE_ISO2, HOME_COUNTRY_ISO2), true)
      return await persistAndReturn(dataDir, state, queue)
    }

    const work = pickNextWork(state.queue, Date.now())
    if (!work) return state // nothing eligible right now — fully caught up (or everything is backing off)

    if (work.type === 'enumerate') {
      const { country } = work
      try {
        const elements = await postOverpassQuery<OverpassRawTagElement>(
          buildCountryEnumerationQuery(country.iso2, country.tier),
        )
        const items = parseEnumerationResponse(elements, country.iso2)
        const queue = recordTickResult(markCountryEnumerated(addItems(state.queue, items), country.iso2), true)
        return await persistAndReturn(dataDir, state, queue)
      } catch (err) {
        console.error(`[area-db-worker] enumeration failed for ${country.iso2}:`, err)
        const queue = recordTickResult(
          markCountryEnumerationFailed(state.queue, country.iso2, String(err), nowIso),
          false,
        )
        return await persistAndReturn(dataDir, state, queue)
      }
    }

    const { item } = work
    const candidate: OverpassCandidate = {
      osmType: item.osmType,
      osmId: item.osmId,
      name: item.name,
      kind: item.kind,
      adminLevel: item.adminLevel,
    }
    try {
      const geometry = await fetchAreaGeometry(candidate)
      const entry = await storeArea(
        dataDir,
        {
          osmType: item.osmType,
          osmId: item.osmId,
          name: item.name,
          kind: item.kind,
          adminLevel: item.adminLevel,
          countryIso2: item.countryIso2,
          fetchedAt: nowIso,
        },
        geometry,
      )
      const queue = recordTickResult(markItemDone(state.queue, itemKey(item.osmType, item.osmId), nowIso), true)
      const manifest = [...state.manifest, entry]
      await saveQueueState(progressPath(dataDir), queue)
      return { queue, manifest, index: buildSpatialIndex(manifest) }
    } catch (err) {
      console.error(`[area-db-worker] fetch failed for ${item.osmType}/${item.osmId} (${item.name}):`, err)
      const queue = recordTickResult(
        markItemFailed(state.queue, itemKey(item.osmType, item.osmId), String(err), nowIso),
        false,
      )
      return await persistAndReturn(dataDir, state, queue)
    }
  } catch (err) {
    console.error('[area-db-worker] tick failed:', err)
    const queue = recordTickResult(state.queue, false)
    try {
      await saveQueueState(progressPath(dataDir), queue)
    } catch (saveErr) {
      console.error('[area-db-worker] failed to persist queue state after a failed tick:', saveErr)
    }
    return { ...state, queue }
  }
}
