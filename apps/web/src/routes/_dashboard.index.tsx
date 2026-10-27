import { lazy, Suspense } from 'react';
import { createFileRoute } from '@tanstack/react-router';
const LiveMap = lazy(() => import('../components/LiveMap').then(m => ({ default: m.LiveMap })));
export const Route = createFileRoute('/_dashboard/')({ ssr: false, component: () => <Suspense fallback={<p>Loading map…</p>}><LiveMap /></Suspense> });
