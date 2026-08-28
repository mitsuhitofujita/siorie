import { fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { renderWithProviders } from '@/test/renderWithProviders'
import { GroupNewPage } from './GroupNewPage'

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

describe('GroupNewPage', () => {
  it('shows an inline error and stays on the form when creation fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(jsonResponse({}, 500)))
    renderWithProviders(<GroupNewPage />)

    fireEvent.change(screen.getByLabelText('グループ名'), {
      target: { value: '漫画喫茶' },
    })
    fireEvent.click(screen.getByRole('button', { name: '作成する' }))

    await waitFor(() =>
      expect(
        screen.getByText('保存できませんでした。もう一度お試しください。'),
      ).toBeInTheDocument(),
    )
    expect(
      screen.getByRole('heading', { name: 'グループを作成' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '作成する' })).not.toBeDisabled()
  })

  it('clears the error on the next successful attempt', async () => {
    const fetchMock = vi
      .fn()
      .mockReturnValueOnce(jsonResponse({}, 500))
      .mockReturnValueOnce(jsonResponse({ id: 'g1', name: '漫画喫茶' }))
    vi.stubGlobal('fetch', fetchMock)
    renderWithProviders(<GroupNewPage />)

    fireEvent.change(screen.getByLabelText('グループ名'), {
      target: { value: '漫画喫茶' },
    })
    fireEvent.click(screen.getByRole('button', { name: '作成する' }))
    await waitFor(() =>
      expect(
        screen.getByText('保存できませんでした。もう一度お試しください。'),
      ).toBeInTheDocument(),
    )

    fireEvent.click(screen.getByRole('button', { name: '作成する' }))
    await waitFor(() =>
      expect(
        screen.queryByText('保存できませんでした。もう一度お試しください。'),
      ).not.toBeInTheDocument(),
    )
  })
})
