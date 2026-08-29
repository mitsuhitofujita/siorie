import { screen } from '@testing-library/react'
import { Route } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import type { AuthState } from '@/lib/auth-context'
import { renderWithProviders } from '@/test/renderWithProviders'
import { RootRoute } from './RootRoute'

function renderAt(authState: AuthState) {
  renderWithProviders(<RootRoute />, {
    authState,
    route: '/',
    path: '/',
    extraRoutes: (
      <>
        <Route path="/login" element={<div>login screen</div>} />
        <Route path="/groups" element={<div>groups screen</div>} />
      </>
    ),
  })
}

describe('RootRoute', () => {
  it('holds (no redirect) while auth status is unknown', () => {
    renderAt({ status: 'loading' })
    expect(screen.queryByText('login screen')).not.toBeInTheDocument()
    expect(screen.queryByText('groups screen')).not.toBeInTheDocument()
  })

  it('redirects an unauthenticated visitor to /login', () => {
    renderAt({ status: 'unauthenticated' })
    expect(screen.getByText('login screen')).toBeInTheDocument()
  })

  it('redirects an authenticated visitor to /groups', () => {
    renderAt({
      status: 'authenticated',
      user: { name: '山田 太郎', pictureUrl: '' },
    })
    expect(screen.getByText('groups screen')).toBeInTheDocument()
  })
})
