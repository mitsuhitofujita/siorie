import type { ReactElement } from 'react'
import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import { AuthContext, type AuthState } from '@/lib/auth-context'

const noop = () => {}
const noopAsync = async () => {}

export function renderWithProviders(
  ui: ReactElement,
  {
    authState = { status: 'unauthenticated' },
    login = noop,
    logout = noopAsync,
    route = '/',
  }: {
    authState?: AuthState
    login?: () => void
    logout?: () => Promise<void>
    route?: string
  } = {},
) {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <AuthContext.Provider value={{ state: authState, login, logout }}>
        {ui}
      </AuthContext.Provider>
    </MemoryRouter>,
  )
}
