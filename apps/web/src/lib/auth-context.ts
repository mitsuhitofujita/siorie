import { createContext, useContext } from 'react'

export type AuthUser = {
  name: string
  pictureUrl: string
}

export type AuthState =
  | { status: 'loading' }
  | { status: 'unauthenticated' }
  | { status: 'authenticated'; user: AuthUser }

export type AuthContextValue = {
  state: AuthState
  // Renders Google's own "Sign in with Google" button into `container`.
  // Google's rendered button (unlike a plain button wired to
  // google.accounts.id.prompt()) falls back to a popup OAuth flow when the
  // browser can't complete a FedCM-based sign-in, so it's the reliable way
  // to offer an explicit, user-clicked sign-in entry point.
  renderSignInButton: (container: HTMLElement) => void
  logout: () => Promise<void>
}

// Exported so tests can supply an arbitrary AuthState without mocking fetch.
export const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider')
  return ctx
}
