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

    expect(screen.queryByText('メニュー')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'メニューを開く' }))

    expect(screen.getByText('メニュー')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'グループ一覧' })).toHaveAttribute(
      'href',
      '/groups',
    )

    fireEvent.click(screen.getByRole('button', { name: 'ログアウト' }))
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
      extraRoutes: <Route path="/" element={<div>ホーム画面</div>} />,
    })

    fireEvent.click(screen.getByRole('button', { name: 'メニューを開く' }))
    fireEvent.click(screen.getByRole('button', { name: 'ログアウト' }))

    await waitFor(() =>
      expect(screen.getByText('ホーム画面')).toBeInTheDocument(),
    )
    expect(logout).toHaveBeenCalledOnce()
  })
})
