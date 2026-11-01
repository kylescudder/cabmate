// A source of SCSTelemetry snapshots. Windows reads the plugin's named file
// mapping directly (win-shm.ts); Linux reads a file under /dev/shm that a
// Proton/Wine bridge mirrors it into (linux-shm.ts).

export const SHM_SIZE = 32 * 1024;

export interface TelemetryMap {
  /** Latest snapshot, or null when the source has no fresh data to sample. */
  read(): Buffer | null;
  close(): void;
}

export interface TelemetryMapOptions {
  /** Linux only: explicit path to the mirrored telemetry file. */
  shmPath?: string;
}
