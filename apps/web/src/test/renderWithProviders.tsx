import type { ReactElement, ReactNode } from 'react'
import { render } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

import { AuthContext, type AuthState } from '@/lib/auth-context'

const noopAsync = async () => {}

export function renderWithProviders(
  ui: ReactElement,
  {
    authState = { status: 'unauthenticated' },
    gisReady = false,
    logout = noopAsync,
    route = '/',
    path,
    extraRoutes,
  }: {
    authState?: AuthState
    gisReady?: boolean
    logout?: () => Promise<void>
    route?: string
    // A route pattern (e.g. '/groups/:groupId') to match `route` against, so
    // a page under test that reads useParams() gets real values. Pages that
    // don't use useParams() can omit this and render directly.
    path?: string
    // Extra <Route> siblings rendered alongside the page under test (requires
    // `path`), so a test can assert navigation by which route's content shows.
    extraRoutes?: ReactNode
  } = {},
) {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <AuthContext.Provider value={{ state: authState, gisReady, logout }}>
        {path ? (
          <Routes>
            <Route path={path} element={ui} />
            {extraRoutes}
          </Routes>
        ) : (
          ui
        )}
      </AuthContext.Provider>
    </MemoryRouter>,
  )
}
