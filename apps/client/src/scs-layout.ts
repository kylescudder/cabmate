import type { ActiveJob, TelemetrySample } from '@ets2/shared'

// Offsets into the scs-sdk-plugin SCSTelemetry shared memory block.
// Layout is documented in scs-telemetry/inc/scs-telemetry-common.hpp on the
// plugin repo. Values here track plugin revision 12.

const O_SDK_ACTIVE = 0
const O_PAUSED = 4

const O_TIME_ABS = 64
const O_TIME_ABS_DELIVERY = 88
const O_PLANNED_DISTANCE_KM = 100

const O_GEAR = 504

const O_FUEL_CAPACITY = 704
const O_SPEED = 948
const O_ENGINE_RPM = 952
const O_FUEL = 1000
const O_WEAR_ENGINE = 1036
const O_WEAR_TRANSMISSION = 1040
const O_WEAR_CABIN = 1044
const O_WEAR_CHASSIS = 1048
const O_WEAR_WHEELS = 1052
const O_TRUCK_ODOMETER = 1056
const O_ROUTE_DISTANCE = 1060
const O_JOB_CARGO_DAMAGE = 1468

const O_COORD_X = 2200
const O_COORD_Z = 2216
const O_ROT_X = 2224

const STR = 64
const O_TRUCK_BRAND = 2300 + 1 * STR
const O_TRUCK_NAME = 2300 + 3 * STR
const O_CARGO = 2300 + 5 * STR
const O_CITY_DST = 2300 + 7 * STR
const O_CITY_SRC = 2300 + 11 * STR

const O_JOB_INCOME = 4000

const O_ON_JOB = 4300

function readCString(buf: Buffer, offset: number, max = STR): string {
  let end = offset
  const stop = offset + max
  while (end < stop && buf[end] !== 0) end++
  return buf.toString('utf8', offset, end)
}

export interface TelemetryStatic {
  sdkActive: boolean
  paused: boolean
  truck: { make: string; model: string; fuelCapacityLitres: number }
  onJob: boolean
}

export function decodeStatic(buf: Buffer): TelemetryStatic {
  return {
    sdkActive: buf[O_SDK_ACTIVE] !== 0,
    paused: buf[O_PAUSED] !== 0,
    truck: {
      make: readCString(buf, O_TRUCK_BRAND) || 'Unknown',
      model: readCString(buf, O_TRUCK_NAME) || 'Unknown',
      fuelCapacityLitres: buf.readFloatLE(O_FUEL_CAPACITY)
    },
    onJob: buf[O_ON_JOB] !== 0
  }
}

export function decodeSample(buf: Buffer, recordedAt: string): TelemetrySample {
  const speedMs = buf.readFloatLE(O_SPEED)
  const heading = buf.readDoubleLE(O_ROT_X) * Math.PI * 2

  const wearEngine = buf.readFloatLE(O_WEAR_ENGINE)
  const wearTransmission = buf.readFloatLE(O_WEAR_TRANSMISSION)
  const wearCabin = buf.readFloatLE(O_WEAR_CABIN)
  const wearChassis = buf.readFloatLE(O_WEAR_CHASSIS)
  const wearWheels = buf.readFloatLE(O_WEAR_WHEELS)
  const truckDamage = Math.max(
    wearEngine,
    wearTransmission,
    wearCabin,
    wearChassis,
    wearWheels
  )

  return {
    recordedAt,
    speedKph: speedMs * 3.6,
    rpm: buf.readFloatLE(O_ENGINE_RPM),
    gear: buf.readInt32LE(O_GEAR),
    fuelLitres: buf.readFloatLE(O_FUEL),
    odometerKm: buf.readFloatLE(O_TRUCK_ODOMETER),
    truckDamage,
    cargoDamage: buf.readFloatLE(O_JOB_CARGO_DAMAGE),
    position: {
      x: buf.readDoubleLE(O_COORD_X),
      z: buf.readDoubleLE(O_COORD_Z),
      heading
    }
  }
}

// Returns the currently-active job if one is being run, or null otherwise.
// Sent at the batch level (constant within a 1-second flush window), not
// per-sample — server uses it to find/create a `jobs` row and link each
// sample's `job_id` to it.
export function decodeJob(buf: Buffer): ActiveJob | null {
  if (buf[O_ON_JOB] === 0) return null
  return {
    cargo: readCString(buf, O_CARGO),
    sourceCity: readCString(buf, O_CITY_SRC),
    destinationCity: readCString(buf, O_CITY_DST),
    income: Number(buf.readBigUInt64LE(O_JOB_INCOME))
  }
}

// Game minutes since some in-game epoch (currently unused by the API, exposed
// for callers that want to detect "new save loaded" via large jumps).
export function gameTimeMinutes(buf: Buffer): number {
  return buf.readUInt32LE(O_TIME_ABS)
}

export function plannedDistanceKm(buf: Buffer): number {
  return buf.readUInt32LE(O_PLANNED_DISTANCE_KM)
}

export function deliveryDeadlineMinutes(buf: Buffer): number {
  return buf.readUInt32LE(O_TIME_ABS_DELIVERY)
}
