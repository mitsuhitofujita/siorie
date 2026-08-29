import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { renderWithProviders } from '@/test/renderWithProviders'
import { LoginPage } from './LoginPage'

describe('LoginPage', () => {
  it('shows a skeleton and no sign-in button while auth status is unknown', () => {
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
})
