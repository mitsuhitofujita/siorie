import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'

import { AuthContext, type AuthState, type AuthUser } from '@/lib/auth-context'

const GIS_SCRIPT_SRC = 'https://accounts.google.com/gsi/client'

function loadGoogleIdentityServices(): Promise<void> {
  if (window.google?.accounts?.id) return Promise.resolve()

  // Guards against injecting a second <script> tag if AuthProvider mounts
  // more than once (e.g. React StrictMode's double-invoked effects).
  const existing = document.querySelector<HTMLScriptElement>(
    `script[src="${GIS_SCRIPT_SRC}"]`,
  )
  if (existing) {
    return new Promise((resolve, reject) => {
      existing.addEventListener('load', () => resolve())
      existing.addEventListener('error', () =>
        reject(new Error('failed to load Google Identity Services')),
      )
    })
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = GIS_SCRIPT_SRC
    script.async = true
    script.onload = () => resolve()
    script.onerror = () =>
      reject(new Error('failed to load Google Identity Services'))
    document.head.appendChild(script)
  })
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' })
  const [gisReady, setGisReady] = useState(false)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  // Used after a successful login. The initial mount-time check below
  // duplicates its body inline rather than calling this, because
  // react-hooks/set-state-in-effect flags a bare function-call statement in
  // an effect body that (transitively) calls setState.
  const refreshMe = useCallback(async () => {
    try {
      const res = await fetch('/api/me')
      if (!res.ok) throw res
      const user = (await res.json()) as AuthUser
      if (mountedRef.current) setState({ status: 'authenticated', user })
    } catch {
      if (mountedRef.current) setState({ status: 'unauthenticated' })
    }
  }, [])

  useEffect(() => {
    fetch('/api/me')
      .then((res) => (res.ok ? res.json() : Promise.reject(res)))
      .then((user: AuthUser) => {
        if (mountedRef.current) setState({ status: 'authenticated', user })
      })
      .catch(() => {
        if (mountedRef.current) setState({ status: 'unauthenticated' })
      })
  }, [])

  const handleCredentialResponse = useCallback(
    (response: { credential: string }) => {
      fetch('/api/auth/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential: response.credential }),
      })
        .then((res) => (res.ok ? refreshMe() : Promise.reject(res)))
        .catch(() => {
          if (mountedRef.current) setState({ status: 'unauthenticated' })
        })
    },
    [refreshMe],
  )

  useEffect(() => {
    let cancelled = false

    loadGoogleIdentityServices()
      .then(() => {
        if (cancelled) return
        window.google!.accounts.id.initialize({
          client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID,
          callback: handleCredentialResponse,
        })
        setGisReady(true)
      })
      .catch((err: unknown) => {
        console.error('Failed to load Google Identity Services', err)
      })

    return () => {
      cancelled = true
    }
  }, [handleCredentialResponse])

  // Renders Google's own button rather than wiring a plain button to
  // google.accounts.id.prompt() (One Tap): prompt() is meant to display
  // automatically on page load, not be triggered by a click, and — unlike
  // the rendered button — has no fallback to a popup flow if a FedCM
  // sign-in can't complete, so a button wired to it can fail with no
  // visible feedback at all.
  const renderSignInButton = useCallback(
    (container: HTMLElement) => {
      if (!gisReady) return
      window.google!.accounts.id.renderButton(container, {
        type: 'standard',
        theme: 'filled_black',
        size: 'large',
        text: 'signin_with',
        shape: 'rectangular',
        locale: 'ja',
      })
    },
    [gisReady],
  )

  const logout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
    } finally {
      setState({ status: 'unauthenticated' })
    }
  }

  return (
    <AuthContext.Provider value={{ state, renderSignInButton, logout }}>
      {children}
    </AuthContext.Provider>
  )
}
