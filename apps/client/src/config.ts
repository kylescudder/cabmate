import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export interface ClientConfig {
  ingestUrl: string
  apiKey: string
  configDir: string
  /** Linux only: where the Proton bridge mirrors SCSTelemetry (default: auto-detect in /dev/shm). */
  shmPath?: string
}

const TEMPLATE = {
  ingestUrl: 'http://127.0.0.1:3000/api/ingest',
  apiKey: 'paste-your-key-from-the-profile-page'
}

export function loadConfig(): ClientConfig {
  const configDir = join(homedir(), '.ets2-tracker')
  const configPath = join(configDir, 'config.json')

  // Read first and create the template only if the file is missing, rather than
  // checking for it and then writing (a check-then-write race).
  let text: string
  try {
    text = readFileSync(configPath, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    mkdirSync(configDir, { recursive: true })
    try {
      writeFileSync(configPath, JSON.stringify(TEMPLATE, null, 2) + '\n', {
        encoding: 'utf8',
        flag: 'wx'
      })
      console.error(`No config found — wrote a template to ${configPath}`)
    } catch (writeError) {
      if ((writeError as NodeJS.ErrnoException).code !== 'EEXIST')
        throw writeError
      console.error(`No config found at ${configPath}`)
    }
    console.error(`Grab your ingestUrl + apiKey from /profile, then re-run.`)
    process.exit(1)
  }

  const raw = JSON.parse(text) as Partial<ClientConfig> & {
    apiUrl?: string
  }
  // Back-compat: earlier template used `apiUrl` with an implicit `/api/ingest` suffix.
  const ingestUrl =
    raw.ingestUrl ?? (raw.apiUrl ? `${raw.apiUrl}/api/ingest` : undefined)
  if (!ingestUrl || !raw.apiKey) {
    throw new Error(`${configPath} is missing ingestUrl or apiKey`)
  }
  return { ingestUrl, apiKey: raw.apiKey, configDir, shmPath: raw.shmPath }
}
