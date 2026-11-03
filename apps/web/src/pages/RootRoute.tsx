import { Navigate } from 'react-router-dom'

import { useAuth } from '@/lib/auth-context'

// `/` holds no UI of its own: it waits for auth to settle, then redirects.
// This is the one place `loading` is handled explicitly, because there is
// nothing else to show here.
export function RootRoute() {
  const { state } = useAuth()

  if (state.status === 'loading') {
    return null
  }

  return (
    <Navigate
      to={state.status === 'authenticated' ? '/groups' : '/login'}
      replace
    />
  )
}
