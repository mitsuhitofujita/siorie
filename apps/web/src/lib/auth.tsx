import { useEffect, useState, type ReactNode } from 'react'

import { AuthContext, type AuthState, type AuthUser } from '@/lib/auth-context'

// TODO(20260823-purpose-and-initial-tech-stack): wire up Google Identity Services once an
// OAuth client ID is provisioned. Today this only fetches /api/me, which has no backend yet,
// so the app always ends up unauthenticated.
export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' })

  useEffect(() => {
    let cancelled = false

    fetch('/api/me')
      .then((res) => (res.ok ? res.json() : Promise.reject(res)))
      .then((user: AuthUser) => {
        if (!cancelled) setState({ status: 'authenticated', user })
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'unauthenticated' })
      })

    return () => {
      cancelled = true
    }
  }, [])

  const login = () => {
    console.info(
      'Google Identity Services is not wired up yet; see docs/discussions/20260823-purpose-and-initial-tech-stack',
    )
  }

  const logout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
    } finally {
      setState({ status: 'unauthenticated' })
    }
  }

  return (
    <AuthContext.Provider value={{ state, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}
