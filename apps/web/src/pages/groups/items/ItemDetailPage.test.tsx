import { fireEvent, screen, waitFor } from '@testing-library/react'
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
    expect(screen.getByText('Completed volume')).toBeInTheDocument()
    expect(screen.getByText('100')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Edit' })).toHaveAttribute(
      'href',
      '/groups/g1/items/i1/edit',
    )
  })

  it('optimistically increments the completed volume from the detail page', async () => {
    const fetchMock = vi.fn(
      (input: string | URL | Request, init?: RequestInit) => {
        const path = String(input)
        if (
          path === '/api/groups/g1/items/i1' &&
          (!init || init.method === undefined)
        ) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () =>
              Promise.resolve({
                id: 'i1',
                title: 'ONE PIECE',
                completedVolume: 100,
              }),
          })
        }
        // PATCH
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              id: 'i1',
              title: 'ONE PIECE',
              completedVolume: 101,
            }),
        })
      },
    )
    vi.stubGlobal('fetch', fetchMock)
    renderWithProviders(<ItemDetailPage />, {
      route: '/groups/g1/items/i1',
      path: '/groups/:groupId/items/:itemId',
    })

    await waitFor(() => expect(screen.getByText('100')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Add a volume' }))

    await waitFor(() => expect(screen.getByText('101')).toBeInTheDocument())
    expect(fetchMock).toHaveBeenLastCalledWith(
      '/api/groups/g1/items/i1',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ title: 'ONE PIECE', completedVolume: 101 }),
      }),
    )
  })

  it('rolls the volume back and shows an inline error when the increment fails', async () => {
    const fetchMock = vi.fn(
      (input: string | URL | Request, init?: RequestInit) => {
        const path = String(input)
        if (
          path === '/api/groups/g1/items/i1' &&
          (!init || init.method === undefined)
        ) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () =>
              Promise.resolve({
                id: 'i1',
                title: 'ONE PIECE',
                completedVolume: 100,
              }),
          })
        }
        return Promise.resolve({
          ok: false,
          status: 500,
          json: () => Promise.resolve({}),
        })
      },
    )
    vi.stubGlobal('fetch', fetchMock)
    renderWithProviders(<ItemDetailPage />, {
      route: '/groups/g1/items/i1',
      path: '/groups/:groupId/items/:itemId',
    })

    await waitFor(() => expect(screen.getByText('100')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Add a volume' }))

    // Optimistic bump shows first, then rolls back on failure.
    await waitFor(() =>
      expect(
        screen.getByText("Couldn't update. Please try again."),
      ).toBeInTheDocument(),
    )
    expect(screen.getByText('100')).toBeInTheDocument()
    expect(screen.queryByText('101')).not.toBeInTheDocument()
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
      expect(
        screen.getByText("Couldn't load. Please try again."),
      ).toBeInTheDocument(),
    )
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
  })
})
