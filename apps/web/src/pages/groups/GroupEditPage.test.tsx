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
      expect(screen.getByText('読み込みに失敗しました。')).toBeInTheDocument(),
    )
    expect(screen.getByRole('button', { name: '再試行' })).toBeInTheDocument()
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
      expect(screen.getByLabelText('グループ名')).toHaveValue('漫画喫茶'),
    )
    fireEvent.click(screen.getByRole('button', { name: '保存する' }))

    await waitFor(() =>
      expect(
        screen.getByText('保存できませんでした。もう一度お試しください。'),
      ).toBeInTheDocument(),
    )
    expect(
      screen.getByRole('heading', { name: 'グループを編集' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '保存する' })).not.toBeDisabled()
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
      expect(screen.getByLabelText('グループ名')).toHaveValue('漫画喫茶'),
    )
    fireEvent.click(screen.getByRole('button', { name: '削除する' }))
    const dialog = screen.getByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: '削除する' }))

    await waitFor(() =>
      expect(
        within(dialog).getByText(
          '削除できませんでした。もう一度お試しください。',
        ),
      ).toBeInTheDocument(),
    )
    // The dialog stays open on failure, so the user can see the error and retry.
    expect(dialog).toBeInTheDocument()
  })
})
