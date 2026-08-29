import { Navigate } from 'react-router-dom'

import { Skeleton } from '@/components/Skeleton'
import { useAuth } from '@/lib/auth-context'

// `/` holds no UI of its own: it waits for auth to settle, then redirects.
// This is the one place `loading` is handled explicitly, because there is
// nothing else to show here.
export function RootRoute() {
  const { state } = useAuth()

  if (state.status === 'loading') {
    return (
      <main className="home">
        <Skeleton className="h-11 w-40" />
        <Skeleton className="h-10 w-52" />
      </main>
    )
  }

  return (
    <Navigate
      to={state.status === 'authenticated' ? '/groups' : '/login'}
      replace
    />
  )
}
