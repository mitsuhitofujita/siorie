import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { AuthProvider } from '@/lib/auth'
import App from './App'

afterEach(() => {
  vi.unstubAllGlobals()
})

function renderApp(route: string) {
  // No backend exists yet, so every /api/* call fails and the app must fall back gracefully
  // (unauthenticated home, empty lists) rather than hang or crash.
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('no backend yet')))
  return render(
    <MemoryRouter initialEntries={[route]}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </MemoryRouter>,
  )
}

describe('App routing', () => {
  it('renders the standalone, layout-less home page at /', async () => {
    renderApp('/')
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Google でログイン' }),
      ).toBeInTheDocument(),
    )
    expect(
      screen.queryByRole('button', { name: 'メニューを開く' }),
    ).not.toBeInTheDocument()
  })

  it('renders group/item routes inside the common layout', async () => {
    renderApp('/groups')
    await waitFor(() =>
      expect(screen.getByText('グループがまだありません')).toBeInTheDocument(),
    )
    expect(
      screen.getByRole('button', { name: 'メニューを開く' }),
    ).toBeInTheDocument()
  })

  it('renders the group creation page', async () => {
    renderApp('/groups/new')
    expect(
      await screen.findByRole('heading', { name: 'グループを作成' }),
    ).toBeInTheDocument()
  })

  it('renders the item creation page under a group', async () => {
    renderApp('/groups/g1/items/new')
    expect(
      await screen.findByRole('heading', { name: 'アイテムを作成' }),
    ).toBeInTheDocument()
  })
})
