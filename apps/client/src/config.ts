import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface ClientConfig {
  ingestUrl: string;
  apiKey: string;
  configDir: string;
  /** Linux only: where the Proton bridge mirrors SCSTelemetry (default: auto-detect in /dev/shm). */
  shmPath?: string;
}

const TEMPLATE = {
  ingestUrl: "http://127.0.0.1:3000/api/ingest",
  apiKey: "paste-your-key-from-the-profile-page",
};

export function loadConfig(): ClientConfig {
  const configDir = join(homedir(), ".ets2-tracker");
  const configPath = join(configDir, "config.json");

  if (!existsSync(configPath)) {
    mkdirSync(configDir, { recursive: true });
    writeFileSync(configPath, JSON.stringify(TEMPLATE, null, 2) + "\n", "utf8");
    console.error(`No config found — wrote a template to ${configPath}`);
    console.error(`Grab your ingestUrl + apiKey from /profile, then re-run.`);
    process.exit(1);
  }

  const raw = JSON.parse(readFileSync(configPath, "utf8")) as Partial<ClientConfig> & {
    apiUrl?: string;
  };
  // Back-compat: earlier template used `apiUrl` with an implicit `/api/ingest` suffix.
  const ingestUrl = raw.ingestUrl ?? (raw.apiUrl ? `${raw.apiUrl}/api/ingest` : undefined);
  if (!ingestUrl || !raw.apiKey) {
    throw new Error(`${configPath} is missing ingestUrl or apiKey`);
  }
  return { ingestUrl, apiKey: raw.apiKey, configDir, shmPath: raw.shmPath };
}
