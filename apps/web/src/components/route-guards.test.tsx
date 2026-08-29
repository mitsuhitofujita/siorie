import { screen } from '@testing-library/react'
import { Route } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import type { AuthState } from '@/lib/auth-context'
import { renderWithProviders } from '@/test/renderWithProviders'
import { RequireAuth, RequireGuest } from './route-guards'

const authenticated: AuthState = {
  status: 'authenticated',
  user: { name: '山田 太郎', pictureUrl: '' },
}

describe('RequireAuth', () => {
  function renderAt(authState: AuthState) {
    renderWithProviders(
      <RequireAuth>
        <div>protected content</div>
      </RequireAuth>,
      {
        authState,
        route: '/protected',
        path: '/protected',
        extraRoutes: <Route path="/login" element={<div>login screen</div>} />,
      },
    )
  }

  it('redirects a settled unauthenticated visitor to /login', () => {
    renderAt({ status: 'unauthenticated' })
    expect(screen.getByText('login screen')).toBeInTheDocument()
    expect(screen.queryByText('protected content')).not.toBeInTheDocument()
  })

  it('lets an authenticated visitor through', () => {
    renderAt(authenticated)
    expect(screen.getByText('protected content')).toBeInTheDocument()
  })

  it('lets a still-loading visitor through so the page shows its own loading UI', () => {
    renderAt({ status: 'loading' })
    expect(screen.getByText('protected content')).toBeInTheDocument()
  })
})

describe('RequireGuest', () => {
  function renderAt(authState: AuthState) {
    renderWithProviders(
      <RequireGuest>
        <div>login content</div>
      </RequireGuest>,
      {
        authState,
        route: '/login',
        path: '/login',
        extraRoutes: (
          <Route path="/groups" element={<div>groups screen</div>} />
        ),
      },
    )
  }

  it('redirects a settled authenticated visitor to /groups', () => {
    renderAt(authenticated)
    expect(screen.getByText('groups screen')).toBeInTheDocument()
    expect(screen.queryByText('login content')).not.toBeInTheDocument()
  })

  it('lets an unauthenticated visitor through', () => {
    renderAt({ status: 'unauthenticated' })
    expect(screen.getByText('login content')).toBeInTheDocument()
  })

  it('lets a still-loading visitor through', () => {
    renderAt({ status: 'loading' })
    expect(screen.getByText('login content')).toBeInTheDocument()
  })
})
