import { fireEvent, screen } from '@testing-library/react'
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
})
