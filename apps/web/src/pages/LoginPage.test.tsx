import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { renderWithProviders } from '@/test/renderWithProviders'
import { LoginPage } from './LoginPage'

describe('LoginPage', () => {
  it('renders nothing while auth status is unknown', () => {
    renderWithProviders(<LoginPage />, { authState: { status: 'loading' } })

    expect(screen.queryByTestId('google-signin-button')).not.toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: 'siorie' }),
    ).not.toBeInTheDocument()
  })

  it('renders the title and Google’s sign-in button container when unauthenticated', () => {
    renderWithProviders(<LoginPage />, {
      authState: { status: 'unauthenticated' },
    })

    expect(screen.getByRole('heading', { name: 'siorie' })).toBeInTheDocument()
    expect(screen.getByTestId('google-signin-button')).toBeInTheDocument()
  })

  it('renders a plain dev-login form (dev builds only) posting to the backend route', () => {
    // import.meta.env.DEV is true under Vitest, matching `vite dev`; a
    // production `vite build` strips the form entirely.
    renderWithProviders(<LoginPage />, {
      authState: { status: 'unauthenticated' },
    })

    const form = screen
      .getByRole('button', { name: 'Dev Login' })
      .closest('form')
    expect(form).toHaveAttribute('action', '/api/auth/dev-login')
    expect(form).toHaveAttribute('method', 'post')
  })
})
