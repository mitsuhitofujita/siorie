import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { renderWithProviders } from '@/test/renderWithProviders'
import { GroupEditPage } from './GroupEditPage'

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

describe('GroupEditPage', () => {
  it('shows an error state with a retry button when the initial load fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('network error')),
    )
    renderWithProviders(<GroupEditPage />, {
      route: '/groups/g1/edit',
      path: '/groups/:groupId/edit',
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
      .mockReturnValueOnce(jsonResponse({ id: 'g1', name: '漫画喫茶' }))
      .mockReturnValueOnce(jsonResponse({}, 500))
    vi.stubGlobal('fetch', fetchMock)
    renderWithProviders(<GroupEditPage />, {
      route: '/groups/g1/edit',
      path: '/groups/:groupId/edit',
    })

    await waitFor(() =>
      expect(screen.getByLabelText('Name')).toHaveValue('漫画喫茶'),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() =>
      expect(
        screen.getByText("Couldn't save. Please try again."),
      ).toBeInTheDocument(),
    )
    expect(
      screen.getByRole('heading', { name: 'Edit group' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save' })).not.toBeDisabled()
  })

  it('shows an inline error inside the delete dialog when deleting fails', async () => {
    const fetchMock = vi
      .fn()
      .mockReturnValueOnce(jsonResponse({ id: 'g1', name: '漫画喫茶' }))
      .mockReturnValueOnce(jsonResponse({}, 500))
    vi.stubGlobal('fetch', fetchMock)
    renderWithProviders(<GroupEditPage />, {
      route: '/groups/g1/edit',
      path: '/groups/:groupId/edit',
    })

    await waitFor(() =>
      expect(screen.getByLabelText('Name')).toHaveValue('漫画喫茶'),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Delete group' }))
    const dialog = screen.getByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }))

    await waitFor(() =>
      expect(
        within(dialog).getByText("Couldn't delete. Please try again."),
      ).toBeInTheDocument(),
    )
    // The dialog stays open on failure, so the user can see the error and retry.
    expect(dialog).toBeInTheDocument()
  })
})
