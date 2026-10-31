import { ClerkProvider } from '@clerk/tanstack-react-start';
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { createRootRouteWithContext, HeadContent, Outlet, Scripts } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { UnitsProvider } from '../lib/units';
import '../globals.css';

const clerkAppearance = {
  variables: {
    colorPrimary: '#fbbf24', colorPrimaryForeground: '#0b0f17',
    colorBackground: '#121826', colorForeground: '#e6e9ef', colorMutedForeground: '#94a3b8',
    colorInput: '#0b0f17', colorInputForeground: '#e6e9ef',
    colorBorder: '#1f2a3d', colorNeutral: '#e6e9ef', colorShadow: '#000000', borderRadius: '0.5rem',
  },
  elements: {
    card: '!border !border-[#1f2a3d] !shadow-none',
    socialButtonsBlockButton: '!border-[#1f2a3d] !bg-[#0b0f17] hover:!bg-[#1f2a3d]',
    formFieldInput: '!border-[#1f2a3d]',
    dividerLine: '!bg-[#1f2a3d]',
    footerActionLink: '!text-[#fbbf24]',
  },
};

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({ meta: [{ charSet: 'utf-8' }, { name: 'viewport', content: 'width=device-width, initial-scale=1' }, { title: 'Cabmate — Your ETS2 companion' }, { name: 'theme-color', content: '#121826' }],
    links: [
      { rel: 'icon', href: '/favicon.svg', type: 'image/svg+xml' },
      { rel: 'apple-touch-icon', href: '/icon-512.png' }, { rel: 'manifest', href: '/site.webmanifest' },
    ] }),
  component: Root, shellComponent: Document,
  notFoundComponent: () => <p className="p-8">Page not found.</p>,
  errorComponent: () => <p role="alert" className="p-8">Unable to load Cabmate. Please try again.</p>,
});
function Root() {
  const { queryClient } = Route.useRouteContext();
  const app = <QueryClientProvider client={queryClient}><UnitsProvider><Outlet /></UnitsProvider></QueryClientProvider>;
  return import.meta.env.VITE_CLERK_PUBLISHABLE_KEY ? <ClerkProvider appearance={clerkAppearance} localization={{
    signIn: { start: { title: 'Sign in to Cabmate', titleCombined: 'Continue to Cabmate' },
      password: { subtitle: 'to continue to Cabmate' }, emailCode: { subtitle: 'to continue to Cabmate' }, emailCodeMfa: { subtitle: 'to continue to Cabmate' } },
    signUp: { start: { title: 'Join Cabmate' } },
  }}>{app}</ClerkProvider> : app;
}
function Document({ children }: { children: ReactNode }) {
  return <html lang="en"><head><HeadContent /></head><body className="min-h-screen">{children}<Scripts /></body></html>;
}
