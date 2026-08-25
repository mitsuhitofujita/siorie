import type { ReactElement } from 'react'
import { render } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

import { AuthContext, type AuthState } from '@/lib/auth-context'

const noop = () => {}
const noopAsync = async () => {}

export function renderWithProviders(
  ui: ReactElement,
  {
    authState = { status: 'unauthenticated' },
    renderSignInButton = noop,
    logout = noopAsync,
    route = '/',
    path,
  }: {
    authState?: AuthState
    renderSignInButton?: (container: HTMLElement) => void
    logout?: () => Promise<void>
    route?: string
    // A route pattern (e.g. '/groups/:groupId') to match `route` against, so
    // a page under test that reads useParams() gets real values. Pages that
    // don't use useParams() can omit this and render directly.
    path?: string
  } = {},
) {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <AuthContext.Provider
        value={{ state: authState, renderSignInButton, logout }}
      >
        {path ? (
          <Routes>
            <Route path={path} element={ui} />
          </Routes>
        ) : (
          ui
        )}
      </AuthContext.Provider>
    </MemoryRouter>,
  )
}
