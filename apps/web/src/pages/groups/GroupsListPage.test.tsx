import { screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { renderWithProviders } from '@/test/renderWithProviders'
import { GroupsListPage } from './GroupsListPage'

afterEach(() => {
  vi.unstubAllGlobals()
})

function stubFetchJson(body: unknown, status = 200) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: status < 400,
      status,
      json: () => Promise.resolve(body),
    }),
  )
}

describe('GroupsListPage', () => {
  it('shows the empty state with a create CTA when there are no groups', async () => {
    stubFetchJson([])
    renderWithProviders(<GroupsListPage />)

    await waitFor(() =>
      expect(screen.getByText('グループがまだありません')).toBeInTheDocument(),
    )
    expect(
      screen.getByRole('link', { name: 'グループを作成' }),
    ).toHaveAttribute('href', '/groups/new')
  })

  it('lists groups with a link to their detail page', async () => {
    stubFetchJson([{ id: 'g1', name: '漫画喫茶' }])
    renderWithProviders(<GroupsListPage />)

    await waitFor(() =>
      expect(screen.getByText('漫画喫茶')).toBeInTheDocument(),
    )
    expect(screen.getByRole('link', { name: '漫画喫茶' })).toHaveAttribute(
      'href',
      '/groups/g1',
    )
  })

  it('falls back to the empty state when the request fails (no backend yet)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('network error')),
    )
    renderWithProviders(<GroupsListPage />)

    await waitFor(() =>
      expect(screen.getByText('グループがまだありません')).toBeInTheDocument(),
    )
  })
})
