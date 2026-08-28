import { screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { renderWithProviders } from '@/test/renderWithProviders'
import { ItemDetailPage } from './ItemDetailPage'

afterEach(() => {
  vi.unstubAllGlobals()
})

function stubFetchByPath(responses: Record<string, unknown>) {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: string | URL | Request) => {
      const path = String(input)
      const body = responses[path]
      if (body === undefined) {
        return Promise.resolve({
          ok: false,
          status: 404,
          json: () => Promise.resolve(null),
        })
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(body),
      })
    }),
  )
}

describe('ItemDetailPage', () => {
  it('shows the item title, completed volume, and an edit link', async () => {
    stubFetchByPath({
      '/api/groups/g1/items/i1': {
        id: 'i1',
        title: 'ONE PIECE',
        completedVolume: 100,
      },
    })
    renderWithProviders(<ItemDetailPage />, {
      route: '/groups/g1/items/i1',
      path: '/groups/:groupId/items/:itemId',
    })

    await waitFor(() =>
      expect(screen.getByText('ONE PIECE')).toBeInTheDocument(),
    )
    expect(screen.getByText('100 巻まで読了')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '編集する' })).toHaveAttribute(
      'href',
      '/groups/g1/items/i1/edit',
    )
  })

  it('shows an error state with a retry button when the item request fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('network error')),
    )
    renderWithProviders(<ItemDetailPage />, {
      route: '/groups/g1/items/i1',
      path: '/groups/:groupId/items/:itemId',
    })

    await waitFor(() =>
      expect(screen.getByText('読み込みに失敗しました。')).toBeInTheDocument(),
    )
    expect(screen.getByRole('button', { name: '再試行' })).toBeInTheDocument()
  })
})
