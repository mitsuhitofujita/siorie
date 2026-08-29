import { fireEvent, screen, waitFor } from '@testing-library/react'
import { Route } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import { renderWithProviders } from '@/test/renderWithProviders'
import { NavMenu } from './NavMenu'

describe('NavMenu', () => {
  it('opens from the account image and offers the groups link and logout', () => {
    const logout = vi.fn().mockResolvedValue(undefined)
    renderWithProviders(<NavMenu />, {
      authState: {
        status: 'authenticated',
        user: { name: '山田 太郎', pictureUrl: '' },
      },
      logout,
    })

    expect(screen.queryByText('Menu')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }))

    expect(screen.getByText('Menu')).toBeInTheDocument()
    expect(screen.getByText('山田 太郎')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Groups' })).toHaveAttribute(
      'href',
      '/groups',
    )

    fireEvent.click(screen.getByRole('button', { name: 'Log out' }))
    expect(logout).toHaveBeenCalledOnce()
  })

  it('navigates to the home page after logging out', async () => {
    const logout = vi.fn().mockResolvedValue(undefined)
    renderWithProviders(<NavMenu />, {
      authState: {
        status: 'authenticated',
        user: { name: '山田 太郎', pictureUrl: '' },
      },
      logout,
      route: '/groups',
      path: '/groups',
      extraRoutes: <Route path="/" element={<div>home screen</div>} />,
    })

    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }))
    fireEvent.click(screen.getByRole('button', { name: 'Log out' }))

    await waitFor(() =>
      expect(screen.getByText('home screen')).toBeInTheDocument(),
    )
    expect(logout).toHaveBeenCalledOnce()
  })
})
