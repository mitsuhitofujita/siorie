import { fireEvent, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { renderWithProviders } from '@/test/renderWithProviders'
import { HomePage } from './HomePage'

describe('HomePage', () => {
  it('shows a loading state while auth status is unknown', () => {
    renderWithProviders(<HomePage />, { authState: { status: 'loading' } })
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('shows a login button when unauthenticated and starts login on click', () => {
    const login = vi.fn()
    renderWithProviders(<HomePage />, {
      authState: { status: 'unauthenticated' },
      login,
    })

    const button = screen.getByRole('button', { name: 'Google でログイン' })
    fireEvent.click(button)
    expect(login).toHaveBeenCalledOnce()
  })

  it('shows account info, a groups link, and a logout button when authenticated', () => {
    const logout = vi.fn().mockResolvedValue(undefined)
    renderWithProviders(<HomePage />, {
      authState: {
        status: 'authenticated',
        user: { name: '山田 太郎', pictureUrl: '' },
      },
      logout,
    })

    expect(screen.getByText('山田 太郎')).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'グループ一覧へ' }),
    ).toHaveAttribute('href', '/groups')

    fireEvent.click(screen.getByRole('button', { name: 'ログアウト' }))
    expect(logout).toHaveBeenCalledOnce()
  })
})
