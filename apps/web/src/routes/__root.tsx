import { QueryClientProvider, type QueryClient } from '@tanstack/react-query'
import {
  createRootRouteWithContext,
  HeadContent,
  Outlet,
  Scripts
} from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { Toaster } from '../components/ui/sonner'
import { UnitsProvider } from '../lib/units'
import '../globals.css'

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()(
  {
    head: () => ({
      meta: [
        { charSet: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { title: 'Cabmate — Your ETS2 companion' },
        { name: 'theme-color', content: '#121826' }
      ],
      links: [
        { rel: 'icon', href: '/favicon.svg', type: 'image/svg+xml' },
        { rel: 'apple-touch-icon', href: '/icon-512.png' },
        { rel: 'manifest', href: '/site.webmanifest' }
      ]
    }),
    component: Root,
    shellComponent: Document,
    notFoundComponent: () => <p className='p-8'>Page not found.</p>,
    errorComponent: () => (
      <p role='alert' className='p-8'>
        Unable to load Cabmate. Please try again.
      </p>
    )
  }
)
function Root() {
  const { queryClient } = Route.useRouteContext()
  return (
    <>
      <QueryClientProvider client={queryClient}>
        <UnitsProvider>
          <Outlet />
        </UnitsProvider>
      </QueryClientProvider>
      <Toaster />
    </>
  )
}
function Document({ children }: { children: ReactNode }) {
  return (
    <html lang='en'>
      <head>
        <HeadContent />
      </head>
      <body className='min-h-screen'>
        {children}
        <Scripts />
      </body>
    </html>
  )
}
