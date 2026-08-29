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
  // True once google.accounts.id has loaded and been initialized, so
  // <GoogleSignInButton> knows when it can render Google's button.
  gisReady: boolean
  logout: () => Promise<void>
}

// Exported so tests can supply an arbitrary AuthState without mocking fetch.
export const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider')
  return ctx
}
