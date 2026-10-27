import { ClerkProvider } from '@clerk/tanstack-react-start';
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { createRootRouteWithContext, HeadContent, Outlet, Scripts } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { UnitsProvider } from '../lib/units';
import '../globals.css';

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({ meta: [{ charSet: 'utf-8' }, { name: 'viewport', content: 'width=device-width, initial-scale=1' }, { title: 'Euro Truck Simulator 2 Data Dashboard' }] }),
  component: Root, shellComponent: Document,
  notFoundComponent: () => <p className="p-8">Page not found.</p>,
  errorComponent: () => <p role="alert" className="p-8">Unable to load the dashboard. Please try again.</p>,
});
function Root() {
  const { queryClient } = Route.useRouteContext();
  const app = <QueryClientProvider client={queryClient}><UnitsProvider><Outlet /></UnitsProvider></QueryClientProvider>;
  return import.meta.env.VITE_CLERK_PUBLISHABLE_KEY ? <ClerkProvider>{app}</ClerkProvider> : app;
}
function Document({ children }: { children: ReactNode }) {
  return <html lang="en"><head><HeadContent /></head><body className="min-h-screen">{children}<Scripts /></body></html>;
}
