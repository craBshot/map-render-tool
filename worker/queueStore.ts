import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { createEmptyQueueState, type QueueState } from './queueLogic.ts'

/** Loads progress.json, or an empty queue if the volume is fresh. */
export async function loadQueueState(path: string): Promise<QueueState> {
  try {
    const raw = await readFile(path, 'utf8')
    return JSON.parse(raw) as QueueState
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return createEmptyQueueState()
    throw err
  }
}

/** Write-to-temp-then-rename so a crash mid-write never corrupts progress.json. */
export async function saveQueueState(path: string, state: QueueState): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  const tmpPath = `${path}.tmp`
  await writeFile(tmpPath, JSON.stringify(state), 'utf8')
  await rename(tmpPath, path)
}
