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

    fireEvent.change(screen.getByLabelText('Name'), {
      target: { value: '漫画喫茶' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))

    await waitFor(() =>
      expect(
        screen.getByText("Couldn't save. Please try again."),
      ).toBeInTheDocument(),
    )
    expect(
      screen.getByRole('heading', { name: 'New group' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Create' })).not.toBeDisabled()
  })

  it('clears the error on the next successful attempt', async () => {
    const fetchMock = vi
      .fn()
      .mockReturnValueOnce(jsonResponse({}, 500))
      .mockReturnValueOnce(jsonResponse({ id: 'g1', name: '漫画喫茶' }))
    vi.stubGlobal('fetch', fetchMock)
    renderWithProviders(<GroupNewPage />)

    fireEvent.change(screen.getByLabelText('Name'), {
      target: { value: '漫画喫茶' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))
    await waitFor(() =>
      expect(
        screen.getByText("Couldn't save. Please try again."),
      ).toBeInTheDocument(),
    )

    fireEvent.click(screen.getByRole('button', { name: 'Create' }))
    await waitFor(() =>
      expect(
        screen.queryByText("Couldn't save. Please try again."),
      ).not.toBeInTheDocument(),
    )
  })
})
