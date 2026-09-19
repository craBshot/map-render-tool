import { DATA_DIR, HTTP_PORT, TICK_INTERVAL_MS } from './config.ts'
import { loadInitialState, runTick } from './fetchLoop.ts'
import { nextTickDelayMs } from './queueLogic.ts'
import { createAreaDbServer } from './server.ts'

let state = await loadInitialState(DATA_DIR)

const server = createAreaDbServer(() => state, DATA_DIR)
server.listen(HTTP_PORT, () => {
  console.log(`[area-db-worker] listening on :${HTTP_PORT}, data dir ${DATA_DIR}`)
})

let stopped = false

async function loop(): Promise<void> {
  while (!stopped) {
    state = await runTick(DATA_DIR, state)
    const delayMs = nextTickDelayMs(state.queue, TICK_INTERVAL_MS)
    await new Promise((resolve) => setTimeout(resolve, delayMs))
  }
}

void loop()

function shutdown(): void {
  stopped = true
  server.close(() => process.exit(0))
}

process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
