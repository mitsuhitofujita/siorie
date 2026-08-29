import { act, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { useAuth } from '@/lib/auth-context'
import { AuthProvider, GoogleSignInButton } from '@/lib/auth'

function Probe() {
  const { state, logout } = useAuth()

  return (
    <div>
      <span data-testid="status">{state.status}</span>
      {state.status === 'authenticated' && (
        <span data-testid="name">{state.user.name}</span>
      )}
      <GoogleSignInButton />
      <button onClick={() => logout()}>logout</button>
    </div>
  )
}

function mockGoogleIdentityServices() {
  const initialize = vi.fn()
  const renderButton = vi.fn()
  vi.stubGlobal('google', { accounts: { id: { initialize, renderButton } } })
  return { initialize, renderButton }
}

afterEach(async () => {
  // Flush any pending passive effect (GoogleSignInButton's renderButton call)
  // while the google stub is still installed, so it can't run against a
  // deleted window.google after teardown. Without this, a congested scheduler
  // can let that effect flush after this synchronous teardown and throw a
  // TypeError reading window.google.accounts.
  await act(async () => {})
  vi.unstubAllGlobals()
  delete (window as { google?: unknown }).google
})

describe('AuthProvider', () => {
  it('starts loading, then becomes unauthenticated when /api/me fails', async () => {
    mockGoogleIdentityServices()
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue({ ok: false, status: 401, json: async () => ({}) }),
    )

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    )

    expect(screen.getByTestId('status')).toHaveTextContent('loading')
    await waitFor(() =>
      expect(screen.getByTestId('status')).toHaveTextContent('unauthenticated'),
    )
  })

  it('becomes authenticated when /api/me succeeds', async () => {
    mockGoogleIdentityServices()
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ name: '山田 太郎', pictureUrl: '' }),
      }),
    )

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    )

    await waitFor(() =>
      expect(screen.getByTestId('status')).toHaveTextContent('authenticated'),
    )
    expect(screen.getByTestId('name')).toHaveTextContent('山田 太郎')
  })

  it('initializes Google Identity Services with the configured client ID', async () => {
    const { initialize } = mockGoogleIdentityServices()
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }),
    )

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    )

    await waitFor(() => expect(initialize).toHaveBeenCalledOnce())
    expect(initialize.mock.calls[0][0]).toMatchObject({
      client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID,
    })
  })

  it('GoogleSignInButton renders the Google button into its own container once GIS is ready', async () => {
    const { renderButton } = mockGoogleIdentityServices()
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }),
    )

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    )

    await waitFor(() => expect(renderButton).toHaveBeenCalledOnce())
    expect(renderButton.mock.calls[0][0]).toBe(
      screen.getByTestId('google-signin-button'),
    )
    expect(renderButton.mock.calls[0][1]).toMatchObject({ locale: 'ja' })
  })

  it('the credential callback posts to /api/auth/google and then re-checks /api/me', async () => {
    const { initialize } = mockGoogleIdentityServices()
    const fetchMock = vi
      .fn()
      // initial GET /api/me on mount
      .mockResolvedValueOnce({ ok: false, json: async () => ({}) })
      // POST /api/auth/google from the credential callback
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) })
      // GET /api/me refresh after login
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ name: '山田 太郎', pictureUrl: '' }),
      })
    vi.stubGlobal('fetch', fetchMock)

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    )

    await waitFor(() => expect(initialize).toHaveBeenCalledOnce())
    const { callback } = initialize.mock.calls[0][0] as {
      callback: (r: { credential: string }) => void
    }

    callback({ credential: 'fake-id-token' })

    await waitFor(() =>
      expect(screen.getByTestId('status')).toHaveTextContent('authenticated'),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/api/auth/google',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ credential: 'fake-id-token' }),
      }),
    )
  })

  it('logout() posts to /api/auth/logout and resets to unauthenticated', async () => {
    mockGoogleIdentityServices()
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ name: '山田 太郎', pictureUrl: '' }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const { getByText } = render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    )

    await waitFor(() =>
      expect(screen.getByTestId('status')).toHaveTextContent('authenticated'),
    )

    getByText('logout').click()

    await waitFor(() =>
      expect(screen.getByTestId('status')).toHaveTextContent('unauthenticated'),
    )
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/logout', {
      method: 'POST',
    })
  })
})
