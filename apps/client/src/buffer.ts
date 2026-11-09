import {
  mkdirSync,
  readdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync
} from 'node:fs'
import { join } from 'node:path'
import type { IngestPayload } from '@cabmate/shared'

// On-disk fallback queue: each unsent batch is one file under <configDir>/pending.
// We replay them on startup and on every successful POST. The api key is stored
// alongside the payload because the ingest contract carries it in the
// Authorization header, not the body.

export interface PendingBatch {
  apiKey: string
  payload: IngestPayload
}

export class BatchBuffer {
  private dir: string

  constructor(configDir: string) {
    this.dir = join(configDir, 'pending')
    mkdirSync(this.dir, { recursive: true })
  }

  persist(batch: PendingBatch): void {
    const name = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`
    writeFileSync(join(this.dir, name), JSON.stringify(batch), 'utf8')
  }

  pending(): { id: string; batch: PendingBatch }[] {
    return readdirSync(this.dir)
      .filter((f) => f.endsWith('.json'))
      .sort()
      .map((f) => ({
        id: f,
        batch: JSON.parse(
          readFileSync(join(this.dir, f), 'utf8')
        ) as PendingBatch
      }))
  }

  clear(id: string): void {
    try {
      unlinkSync(join(this.dir, id))
    } catch {
      // already gone — fine
    }
  }
}
