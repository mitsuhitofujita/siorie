import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'

import { useAuth } from '@/lib/auth-context'

// Gates the authenticated area (wraps the AppLayout route element once).
// Only a settled `unauthenticated` redirects; `loading` and `authenticated`
// fall through so each page handles its own loading. Trade-off: an
// unauthenticated deep link to /groups/xyz fires one 401 before the
// redirect — accepted as minor.
export function RequireAuth({ children }: { children: ReactNode }) {
  const { state } = useAuth()
  if (state.status === 'unauthenticated') {
    return <Navigate to="/login" replace />
  }
  return <>{children}</>
}

// Mirror of RequireAuth for the guest-only /login route. A settled
// `authenticated` is sent to /groups — this is what makes the post-login
// transition declarative: sign-in flips auth state, and the redirect
// follows. `loading` and `unauthenticated` fall through so /login renders
// nothing until auth settles, then the button.
export function RequireGuest({ children }: { children: ReactNode }) {
  const { state } = useAuth()
  if (state.status === 'authenticated') {
    return <Navigate to="/groups" replace />
  }
  return <>{children}</>
}
