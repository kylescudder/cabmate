import { z } from "zod";

export const TelemetrySample = z.object({
  recordedAt: z.string().datetime(),
  speedKph: z.number(),
  rpm: z.number(),
  gear: z.number().int(),
  fuelLitres: z.number(),
  odometerKm: z.number(),
  truckDamage: z.number().min(0).max(1),
  cargoDamage: z.number().min(0).max(1),
  position: z.object({
    x: z.number(),
    z: z.number(),
    heading: z.number(),
  }),
});
export type TelemetrySample = z.infer<typeof TelemetrySample>;

export const ActiveJob = z.object({
  cargo: z.string(),
  sourceCity: z.string(),
  destinationCity: z.string(),
  income: z.number(),
});
export type ActiveJob = z.infer<typeof ActiveJob>;

export const Truck = z.object({
  make: z.string(),
  model: z.string(),
  fuelCapacityLitres: z.number().optional(),
});
export type Truck = z.infer<typeof Truck>;

// Per-batch payload. `truck` + `job` are batch-level (constant per second
// of driving, no reason to repeat them on every sample). Server normalises:
// truck → vehicles row, job → jobs row, samples → telemetry rows linked to
// both via session_id + job_id.
export const IngestPayload = z.object({
  sessionId: z.string().uuid(),
  truck: Truck,
  job: ActiveJob.nullable().optional(),
  samples: z.array(TelemetrySample).min(1).max(200),
});
export type IngestPayload = z.infer<typeof IngestPayload>;

export type DriverStatus = "online" | "idle" | "offline";

export interface LiveDriver {
  userId: string;
  name: string;
  status: DriverStatus;
  truck: { make: string; model: string } | null;
  latest: TelemetrySample | null;
  job: ActiveJob | null;
}

export type WsServerMessage =
  | { type: "snapshot"; drivers: LiveDriver[] }
  | {
      type: "update";
      userId: string;
      name: string;
      sample: TelemetrySample;
      truck: { make: string; model: string };
      job: ActiveJob | null;
    }
  | { type: "offline"; userId: string };

export { RADIO_STREAM_ORIGIN, type RadioStation, type RadioState } from './radio';
