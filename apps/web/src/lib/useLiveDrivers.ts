import { useEffect, useSyncExternalStore } from 'react';
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import type { ActiveJob, TelemetrySample } from '@ets2/shared';
import { api } from './api';

export interface DriverRow {
  userId: string; name: string; displayName: string; avatarUrl: string | null;
  status: 'online' | 'offline'; truck: { make: string; model: string } | null;
  fuelCapacityLitres: number | null; latest: TelemetrySample | null; job: ActiveJob | null;
}

// Polling only while the socket is down (outages, or `bun run dev`, which has no /ws).
const FALLBACK_POLL_MS = 2000;

// One socket per tab, shared by every component using the hook.
let socket: WebSocket | undefined;
let retry: ReturnType<typeof setTimeout> | undefined;
let attempts = 0;
let users = 0;
let live = false;
const listeners = new Set<() => void>();
function setLive(value: boolean) { live = value; listeners.forEach(listener => listener()); }

function receive(queryClient: QueryClient, drivers: DriverRow[]) {
  const before = new Map(queryClient.getQueryData<DriverRow[]>(['drivers'])?.map(d => [d.userId, d.latest?.recordedAt]));
  // A driver page refetches its history only when that driver actually sent new samples.
  for (const d of drivers) if (d.latest && before.get(d.userId) !== d.latest.recordedAt) void queryClient.invalidateQueries({ queryKey: ['driver', d.name] });
  queryClient.setQueryData(['drivers'], drivers);
}

function connect(queryClient: QueryClient) {
  const url = new URL('/ws', window.location.href);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  const ws = new WebSocket(url);
  socket = ws;
  ws.onopen = () => { attempts = 0; setLive(true); };
  ws.onmessage = event => {
    const message = JSON.parse(event.data as string) as { type: string; drivers: DriverRow[] };
    if (message.type === 'drivers') receive(queryClient, message.drivers);
  };
  ws.onclose = () => {
    if (socket !== ws) return;
    socket = undefined;
    setLive(false);
    if (users > 0) retry = setTimeout(() => connect(queryClient), Math.min(30_000, 1000 * 2 ** attempts++));
  };
}

function acquire(queryClient: QueryClient) {
  if (users++ === 0) connect(queryClient);
  return () => {
    if (--users > 0) return;
    clearTimeout(retry);
    const ws = socket;
    socket = undefined;
    ws?.close();
    setLive(false);
  };
}

export function useLiveDrivers() {
  const queryClient = useQueryClient();
  useEffect(() => acquire(queryClient), [queryClient]);
  const connected = useSyncExternalStore(
    listener => { listeners.add(listener); return () => listeners.delete(listener); },
    () => live, () => false,
  );
  const query = useQuery({ queryKey: ['drivers'], queryFn: () => api<DriverRow[]>('/api/drivers'),
    refetchInterval: connected ? false : FALLBACK_POLL_MS, retry: false });
  return { drivers: query.data ?? [], connected };
}
