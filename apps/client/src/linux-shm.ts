import { closeSync, existsSync, fstatSync, openSync, readSync, statSync } from "node:fs";
import { SHM_SIZE, type TelemetryMap, type TelemetryMapOptions } from "./telemetry-map.js";

// Linux (Steam Proton / Wine) access to the scs-sdk-plugin telemetry block.
// Under Proton the plugin's "Local\\SCSTelemetry" mapping only exists inside
// Wine, so a bridge such as winecarte (https://github.com/srounce/winecarte)
// mirrors it to a file in /dev/shm. We read that file with plain fs calls.
//
// Unlike the Windows mapping, the mirrored file outlives the game, so a file
// whose contents stop changing is treated as stale rather than sampled forever.

const CANDIDATES = [
  "/dev/shm/SCSTelemetry",
  "/dev/shm/SHSCSTelemetry",
  "/dev/shm/Local\\SCSTelemetry",
];

// The plugin rewrites the block every game frame; a running game never leaves
// it untouched this long.
const STALE_MS = 5000;

function findPath(shmPath?: string): string {
  if (shmPath) {
    if (!existsSync(shmPath)) throw new Error(`SCS telemetry file not found at ${shmPath}`);
    return shmPath;
  }
  const found = CANDIDATES.find((p) => existsSync(p));
  if (!found) {
    throw new Error(
      `SCS telemetry file not found in /dev/shm (is the game running under Proton with scs-sdk-plugin and a /dev/shm bridge such as winecarte? set "shmPath" in config.json if it lives elsewhere)`,
    );
  }
  return found;
}

export function openTelemetryMap(opts: TelemetryMapOptions = {}): TelemetryMap {
  const path = findPath(opts.shmPath);
  const fd = openSync(path, "r");
  const ino = fstatSync(fd).ino;

  const snapshot = Buffer.alloc(SHM_SIZE);
  // Seeded from the file as we found it: a leftover block from the last session
  // must change before we trust it.
  const previous = Buffer.alloc(SHM_SIZE);
  readSync(fd, previous, 0, SHM_SIZE, 0);
  let lastChange = 0;

  return {
    read() {
      // The bridge recreates the file when the game restarts; our fd would keep
      // pointing at the old, unlinked one.
      if (statSync(path, { throwIfNoEntry: false })?.ino !== ino) {
        throw new Error(`${path} was replaced or removed`);
      }
      const n = readSync(fd, snapshot, 0, SHM_SIZE, 0);
      if (n < SHM_SIZE) snapshot.fill(0, n);
      const now = Date.now();
      if (!snapshot.equals(previous)) {
        snapshot.copy(previous);
        lastChange = now;
      }
      return now - lastChange > STALE_MS ? null : snapshot;
    },
    close() {
      closeSync(fd);
    },
  };
}
