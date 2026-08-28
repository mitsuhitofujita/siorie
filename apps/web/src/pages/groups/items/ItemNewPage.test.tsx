import { fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { renderWithProviders } from '@/test/renderWithProviders'
import { ItemNewPage } from './ItemNewPage'

afterEach(() => {
  vi.unstubAllGlobals()
})

function jsonResponse(body: unknown, status = 200) {
  return Promise.resolve({
    ok: status < 400,
    status,
    json: () => Promise.resolve(body),
  })
}

describe('ItemNewPage', () => {
  it('shows an inline error and stays on the form when creation fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(jsonResponse({}, 500)))
    renderWithProviders(<ItemNewPage />, {
      route: '/groups/g1/items/new',
      path: '/groups/:groupId/items/new',
    })

    fireEvent.change(screen.getByLabelText('タイトル'), {
      target: { value: 'ONE PIECE' },
    })
    fireEvent.click(screen.getByRole('button', { name: '作成する' }))

    await waitFor(() =>
      expect(
        screen.getByText('保存できませんでした。もう一度お試しください。'),
      ).toBeInTheDocument(),
    )
    expect(
      screen.getByRole('heading', { name: 'アイテムを作成' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '作成する' })).not.toBeDisabled()
  })
})
