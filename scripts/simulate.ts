import { randomUUID } from 'node:crypto';
import { IngestPayload } from '@ets2/shared';
const url = process.env.INGEST_URL || 'http://localhost:3000/api/ingest';
const apiKey = process.env.AGENT_API_KEY;
if (!apiKey) throw new Error('Set AGENT_API_KEY to a disposable driver’s profile key');
const sessionId = randomUUID();
let odometer = 1000;
async function send() {
  const payload = IngestPayload.parse({ sessionId, truck: { make: 'Scania', model: 'S 730', fuelCapacityLitres: 800 },
    job: { cargo: 'Pallets', sourceCity: 'Berlin', destinationCity: 'Paris', income: 1500 },
    samples: [{ recordedAt: new Date().toISOString(), speedKph: 80, rpm: 1400, gear: 10, fuelLitres: 600,
      odometerKm: odometer += 80 / 3600, truckDamage: 0, cargoDamage: 0, position: { x: 1300, z: -200, heading: 0 } }] });
  const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` }, body: JSON.stringify(payload) });
  if (!response.ok) throw new Error(`Ingest returned ${response.status}`);
}
for (;;) { await send(); await Bun.sleep(1000); }
