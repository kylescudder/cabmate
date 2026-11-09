import { afterAll, beforeAll, expect, test } from 'bun:test'
import { Window } from 'happy-dom'
import { act, createElement } from 'react'
import type { Root } from 'react-dom/client'
import type { QueryClient } from '@tanstack/react-query'

const browser = new Window({ url: 'https://cabmate.test/profile' })
const originals = new Map<string, PropertyDescriptor | undefined>()
const calls: { method: string; type: string | null }[] = []
let reply: () => Response = () => Response.json({ image: null })
let createRoot: typeof import('react-dom/client').createRoot
let ProfileForm: typeof import('../src/components/ProfileForm').ProfileForm
let profile: typeof import('../src/lib/profile')
let QueryClientClass: typeof import('@tanstack/react-query').QueryClient
let QueryClientProvider: typeof import('@tanstack/react-query').QueryClientProvider
let root: Root | undefined
let container: HTMLDivElement

beforeAll(async () => {
  const globals: Record<string, unknown> = {
    window: browser,
    document: browser.document,
    navigator: browser.navigator,
    localStorage: browser.localStorage,
    HTMLElement: browser.HTMLElement,
    HTMLInputElement: browser.HTMLInputElement,
    Node: browser.Node,
    Element: browser.Element,
    MutationObserver: browser.MutationObserver,
    getComputedStyle: browser.getComputedStyle.bind(browser),
    IS_REACT_ACT_ENVIRONMENT: true,
    fetch: async (input: string, init: RequestInit = {}) => {
      expect(input).toBe('/api/profile/avatar')
      calls.push({
        method: init.method ?? 'GET',
        type: new Headers(init.headers).get('content-type')
      })
      return reply()
    }
  }
  for (const [key, value] of Object.entries(globals)) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key))
    Object.defineProperty(globalThis, key, {
      configurable: true,
      writable: true,
      value
    })
  }
  ;({ createRoot } = await import('react-dom/client'))
  ;({ ProfileForm } = await import('../src/components/ProfileForm'))
  profile = await import('../src/lib/profile')
  ;({ QueryClient: QueryClientClass, QueryClientProvider } =
    await import('@tanstack/react-query'))
  // happy-dom has no canvas; the browser-side crop is covered by the server's re-encode.
  const { profileAvatar } = await import('../src/lib/profile-ui')
  profileAvatar.resize = async (file: File) =>
    new File([file], 'avatar.jpg', { type: 'image/jpeg' })
})

afterAll(() => {
  act(() => root?.unmount())
  for (const [key, descriptor] of originals) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor)
    else delete (globalThis as Record<string, unknown>)[key]
  }
  browser.close()
})

const initial = {
  id: 'driver-1',
  name: 'night-trucker',
  display_name: 'Night Trucker',
  avatar_url: null
}

async function render(photo: string | null = null) {
  act(() => root?.unmount())
  container = document.createElement('div')
  document.body.replaceChildren(container)
  const client: QueryClient = new QueryClientClass()
  let invalidations = 0
  const invalidate = client.invalidateQueries.bind(client)
  client.invalidateQueries = ((...args: Parameters<typeof invalidate>) => {
    invalidations++
    return invalidate(...args)
  }) as typeof invalidate
  root = createRoot(container)
  await act(async () =>
    root!.render(
      createElement(
        QueryClientProvider,
        { client },
        createElement(ProfileForm, { initial: { ...initial, photo } })
      )
    )
  )
  return { invalidations: () => invalidations }
}

const buttons = () =>
  [...container.querySelectorAll('button')].map((button) => button.textContent)
async function choose(file: File) {
  const input = container.querySelector<HTMLInputElement>('input[type=file]')!
  Object.defineProperty(input, 'files', { configurable: true, value: [file] })
  await act(async () => {
    input.dispatchEvent(
      new browser.Event('change', { bubbles: true }) as unknown as Event
    )
  })
}

test('drivers upload, replace and remove their photo from Your cab, refreshing the account menu', async () => {
  const { invalidations } = await render()
  expect(container.textContent).toContain('Profile photo')
  expect(container.querySelector('img')).toBeNull()
  expect(buttons()).toEqual(['Upload photo', 'Save'])
  expect(
    container.querySelector('input[type=file]')!.getAttribute('accept')
  ).toBe('image/jpeg,image/png,image/webp')

  calls.length = 0
  reply = () => Response.json({ image: '/api/profile/avatar?v=one' })
  await choose(new File(['photo'], 'me.png', { type: 'image/png' }))
  expect(calls).toEqual([{ method: 'PUT', type: 'image/jpeg' }])
  expect(container.querySelector('img')!.getAttribute('src')).toBe(
    '/api/profile/avatar?v=one'
  )
  expect(container.textContent).toContain('Photo updated.')
  expect(buttons()).toEqual(['Change photo', 'Remove', 'Save'])
  // Refreshing queries also refreshes the Better Auth session behind the header UserButton.
  expect(invalidations()).toBe(1)

  reply = () => Response.json({ image: '/api/profile/avatar?v=two' })
  await choose(new File(['photo'], 'me.webp', { type: 'image/webp' }))
  expect(container.querySelector('img')!.getAttribute('src')).toBe(
    '/api/profile/avatar?v=two'
  )

  calls.length = 0
  reply = () => Response.json({ image: null })
  const remove = [...container.querySelectorAll('button')].find(
    (button) => button.textContent === 'Remove'
  )!
  await act(async () => {
    remove.click()
  })
  expect(calls).toEqual([{ method: 'DELETE', type: null }])
  expect(container.querySelector('img')).toBeNull()
  expect(container.textContent).toContain('Photo removed.')
  expect(buttons()).toEqual(['Upload photo', 'Save'])
  expect(invalidations()).toBe(3)
})

test('server refusals are shown and leave the current photo in place', async () => {
  await render('/api/profile/avatar?v=kept')
  reply = () =>
    Response.json({ error: 'This photo is too large.' }, { status: 413 })
  await choose(new File(['photo'], 'big.jpg', { type: 'image/jpeg' }))
  expect(container.querySelector('[role=alert]')!.textContent).toBe(
    'This photo is too large.'
  )
  expect(container.querySelector('img')!.getAttribute('src')).toBe(
    '/api/profile/avatar?v=kept'
  )
})

test('the browser refuses non-image files before uploading', async () => {
  await expect(
    profile.prepareAvatar(
      new File(['<svg/>'], 'x.svg', { type: 'image/svg+xml' })
    )
  ).rejects.toThrow('Choose a JPEG, PNG or WebP photo.')
  await expect(
    profile.prepareAvatar(
      new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'x.png', {
        type: 'image/png'
      })
    )
  ).rejects.toThrow('smaller than 10 MB')
})
