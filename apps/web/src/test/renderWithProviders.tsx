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
    renderSignInButton = noop,
    logout = noopAsync,
    route = '/',
  }: {
    authState?: AuthState
    renderSignInButton?: (container: HTMLElement) => void
    logout?: () => Promise<void>
    route?: string
  } = {},
) {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <AuthContext.Provider
        value={{ state: authState, renderSignInButton, logout }}
      >
        {ui}
      </AuthContext.Provider>
    </MemoryRouter>,
  )
}
