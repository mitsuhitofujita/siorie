import { act, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { AuthProvider } from '@/lib/auth'
import App from './App'

afterEach(async () => {
  // Flush GoogleSignInButton's pending renderButton effect while the google
  // stub is still installed (same reason as auth.test.tsx's afterEach), then
  // unstub.
  await act(async () => {})
  vi.unstubAllGlobals()
  delete (window as { google?: unknown }).google
})

function renderApp(route: string, { authenticated = false } = {}) {
  // Stub google so AuthProvider's loadGoogleIdentityServices() resolves
  // immediately instead of appending a real <script> to document.head that
  // no test ever removes.
  vi.stubGlobal('google', {
    accounts: { id: { initialize: vi.fn(), renderButton: vi.fn() } },
  })
  // No backend exists yet: /api/me decides auth, every other /api/* call
  // fails and the page under it must degrade (error state) rather than hang.
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString()
      if (url === '/api/me') {
        return authenticated
          ? Promise.resolve({
              ok: true,
              json: async () => ({ name: '山田 太郎', pictureUrl: '' }),
            })
          : Promise.resolve({ ok: false, status: 401, json: async () => ({}) })
      }
      return Promise.reject(new Error('no backend yet'))
    }),
  )
  return render(
    <MemoryRouter initialEntries={[route]}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </MemoryRouter>,
  )
}

describe('App routing', () => {
  it('redirects / to the layout-less login view when unauthenticated', async () => {
    renderApp('/')
    await waitFor(() =>
      expect(screen.getByTestId('google-signin-button')).toBeInTheDocument(),
    )
    expect(
      screen.queryByRole('button', { name: 'Open menu' }),
    ).not.toBeInTheDocument()
  })

  it('redirects / to the groups list when authenticated', async () => {
    renderApp('/', { authenticated: true })
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Open menu' }),
      ).toBeInTheDocument(),
    )
  })

  it('renders /login without the common layout', async () => {
    renderApp('/login')
    await waitFor(() =>
      expect(screen.getByTestId('google-signin-button')).toBeInTheDocument(),
    )
    expect(
      screen.queryByRole('button', { name: 'Open menu' }),
    ).not.toBeInTheDocument()
  })

  it('sends an unauthenticated visitor of a protected route to /login', async () => {
    renderApp('/groups')
    await waitFor(() =>
      expect(screen.getByTestId('google-signin-button')).toBeInTheDocument(),
    )
    expect(
      screen.queryByRole('button', { name: 'Open menu' }),
    ).not.toBeInTheDocument()
  })

  it('renders group/item routes inside the common layout when authenticated', async () => {
    renderApp('/groups', { authenticated: true })
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Open menu' }),
      ).toBeInTheDocument(),
    )
    expect(
      await screen.findByText("Couldn't load. Please try again."),
    ).toBeInTheDocument()
  })

  it('renders the group detail route inside the common layout when authenticated', async () => {
    renderApp('/groups/g1', { authenticated: true })
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Open menu' }),
      ).toBeInTheDocument(),
    )
  })

  it('renders the group creation page when authenticated', async () => {
    renderApp('/groups/new', { authenticated: true })
    expect(
      await screen.findByRole('heading', { name: 'New group' }),
    ).toBeInTheDocument()
  })

  it('renders the item creation page under a group when authenticated', async () => {
    renderApp('/groups/g1/items/new', { authenticated: true })
    expect(
      await screen.findByRole('heading', { name: 'New item' }),
    ).toBeInTheDocument()
  })

  it('renders the item detail route inside the common layout when authenticated', async () => {
    renderApp('/groups/g1/items/i1', { authenticated: true })
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Open menu' }),
      ).toBeInTheDocument(),
    )
  })
})
