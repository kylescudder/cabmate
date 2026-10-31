import { healthClient } from './db';

export async function healthResponse(revision: string) {
  try {
    await healthClient()`select id from users limit 0`;
    return Response.json({ status: 'ok', revision }, { headers: { 'cache-control': 'no-store' } });
  } catch { return Response.json({ status: 'unavailable' }, { status: 503 }); }
}
