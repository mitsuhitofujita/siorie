import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { renderWithProviders } from '@/test/renderWithProviders'
import { ItemEditPage } from './ItemEditPage'

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

describe('ItemEditPage', () => {
  it('shows an error state with a retry button when the initial load fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('network error')),
    )
    renderWithProviders(<ItemEditPage />, {
      route: '/groups/g1/items/i1/edit',
      path: '/groups/:groupId/items/:itemId/edit',
    })

    await waitFor(() =>
      expect(
        screen.getByText("Couldn't load. Please try again."),
      ).toBeInTheDocument(),
    )
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
  })

  it('shows an inline error and stays on the form when saving fails', async () => {
    const fetchMock = vi
      .fn()
      .mockReturnValueOnce(
        jsonResponse({ id: 'i1', title: 'ONE PIECE', completedVolume: 100 }),
      )
      .mockReturnValueOnce(jsonResponse({}, 500))
    vi.stubGlobal('fetch', fetchMock)
    renderWithProviders(<ItemEditPage />, {
      route: '/groups/g1/items/i1/edit',
      path: '/groups/:groupId/items/:itemId/edit',
    })

    await waitFor(() =>
      expect(screen.getByLabelText('Title')).toHaveValue('ONE PIECE'),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() =>
      expect(
        screen.getByText("Couldn't save. Please try again."),
      ).toBeInTheDocument(),
    )
    expect(screen.getByRole('button', { name: 'Save' })).not.toBeDisabled()
  })

  it('shows an inline error inside the delete dialog when deleting fails', async () => {
    const fetchMock = vi
      .fn()
      .mockReturnValueOnce(
        jsonResponse({ id: 'i1', title: 'ONE PIECE', completedVolume: 100 }),
      )
      .mockReturnValueOnce(jsonResponse({}, 500))
    vi.stubGlobal('fetch', fetchMock)
    renderWithProviders(<ItemEditPage />, {
      route: '/groups/g1/items/i1/edit',
      path: '/groups/:groupId/items/:itemId/edit',
    })

    await waitFor(() =>
      expect(screen.getByLabelText('Title')).toHaveValue('ONE PIECE'),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Delete item' }))
    const dialog = screen.getByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }))

    await waitFor(() =>
      expect(
        within(dialog).getByText("Couldn't delete. Please try again."),
      ).toBeInTheDocument(),
    )
    expect(dialog).toBeInTheDocument()
  })
})
