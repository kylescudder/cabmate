import koffi from "koffi";
import { SHM_SIZE, type TelemetryMap } from "./telemetry-map.js";

// Windows shared-memory access for the scs-sdk-plugin telemetry block.
// The plugin creates a 32 KiB file mapping named "Local\\SCSTelemetry" while
// ETS2/ATS is running with the plugin installed. We open a read-only view and
// hand back a Node Buffer that mirrors the block; callers re-copy it each tick.

const FILE_MAP_READ = 0x0004;
const SHM_NAME = "Local\\SCSTelemetry";

const kernel32 = koffi.load("kernel32.dll");

const OpenFileMappingA = kernel32.func(
  "__stdcall",
  "OpenFileMappingA",
  "void *",
  ["uint32", "bool", "str"],
);
const MapViewOfFile = kernel32.func(
  "__stdcall",
  "MapViewOfFile",
  "void *",
  ["void *", "uint32", "uint32", "uint32", "size_t"],
);
const UnmapViewOfFile = kernel32.func(
  "__stdcall",
  "UnmapViewOfFile",
  "bool",
  ["void *"],
);
const CloseHandle = kernel32.func("__stdcall", "CloseHandle", "bool", ["void *"]);
const GetLastError = kernel32.func("__stdcall", "GetLastError", "uint32", []);

export function openTelemetryMap(): TelemetryMap {
  const handle = OpenFileMappingA(FILE_MAP_READ, false, SHM_NAME);
  if (!handle) {
    const code = GetLastError();
    if (code === 2) {
      throw new Error(
        `SCS telemetry mapping not found (is ETS2/ATS running with scs-sdk-plugin installed?)`,
      );
    }
    throw new Error(`OpenFileMappingA failed (GetLastError=${code})`);
  }

  const view = MapViewOfFile(handle, FILE_MAP_READ, 0, 0, SHM_SIZE);
  if (!view) {
    const code = GetLastError();
    CloseHandle(handle);
    throw new Error(`MapViewOfFile failed (GetLastError=${code})`);
  }

  const snapshot = Buffer.allocUnsafe(SHM_SIZE);

  return {
    read() {
      const bytes = koffi.decode(view, "uint8", SHM_SIZE) as Uint8Array | Buffer;
      if (Buffer.isBuffer(bytes)) {
        bytes.copy(snapshot);
      } else {
        snapshot.set(bytes);
      }
      return snapshot;
    },
    close() {
      UnmapViewOfFile(view);
      CloseHandle(handle);
    },
  };
}
