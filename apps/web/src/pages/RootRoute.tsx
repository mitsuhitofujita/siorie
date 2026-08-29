import { Navigate } from 'react-router-dom'

import { Skeleton } from '@/components/ui/skeleton'
import { useAuth } from '@/lib/auth-context'

// `/` holds no UI of its own: it waits for auth to settle, then redirects.
// This is the one place `loading` is handled explicitly, because there is
// nothing else to show here.
export function RootRoute() {
  const { state } = useAuth()

  if (state.status === 'loading') {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-10 w-48" />
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
