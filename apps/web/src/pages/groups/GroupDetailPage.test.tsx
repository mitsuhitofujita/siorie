import { screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { renderWithProviders } from '@/test/renderWithProviders'
import { GroupDetailPage } from './GroupDetailPage'

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

describe('GroupDetailPage', () => {
  it('shows the group name, an edit link, and the item empty state', async () => {
    stubFetchByPath({
      '/api/groups/g1': { id: 'g1', name: '漫画喫茶' },
      '/api/groups/g1/items': [],
    })
    renderWithProviders(<GroupDetailPage />, {
      route: '/groups/g1',
      path: '/groups/:groupId',
    })

    await waitFor(() =>
      expect(screen.getByText('漫画喫茶')).toBeInTheDocument(),
    )
    expect(screen.getByRole('link', { name: 'Edit' })).toHaveAttribute(
      'href',
      '/groups/g1/edit',
    )
    await waitFor(() =>
      expect(screen.getByText('No items yet.')).toBeInTheDocument(),
    )
    expect(screen.getByRole('link', { name: 'Add item' })).toHaveAttribute(
      'href',
      '/groups/g1/items/new',
    )
  })

  it('lists items with a link to their detail page', async () => {
    stubFetchByPath({
      '/api/groups/g1': { id: 'g1', name: '漫画喫茶' },
      '/api/groups/g1/items': [
        { id: 'i1', title: 'ONE PIECE', completedVolume: 100 },
      ],
    })
    renderWithProviders(<GroupDetailPage />, {
      route: '/groups/g1',
      path: '/groups/:groupId',
    })

    await waitFor(() =>
      expect(screen.getByText('ONE PIECE')).toBeInTheDocument(),
    )
    expect(screen.getByText('100')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /ONE PIECE/ })).toHaveAttribute(
      'href',
      '/groups/g1/items/i1',
    )
  })

  it('shows an error state with a retry button when the group request fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('network error')),
    )
    renderWithProviders(<GroupDetailPage />, {
      route: '/groups/g1',
      path: '/groups/:groupId',
    })

    await waitFor(() =>
      expect(
        screen.getByText("Couldn't load. Please try again."),
      ).toBeInTheDocument(),
    )
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
  })

  it('shows an item-list error state (distinct from the empty state) when only the item request fails', async () => {
    stubFetchByPath({ '/api/groups/g1': { id: 'g1', name: '漫画喫茶' } })
    renderWithProviders(<GroupDetailPage />, {
      route: '/groups/g1',
      path: '/groups/:groupId',
    })

    await waitFor(() =>
      expect(screen.getByText('漫画喫茶')).toBeInTheDocument(),
    )
    await waitFor(() =>
      expect(
        screen.getByText("Couldn't load. Please try again."),
      ).toBeInTheDocument(),
    )
    expect(screen.queryByText('No items yet.')).not.toBeInTheDocument()
  })
})
