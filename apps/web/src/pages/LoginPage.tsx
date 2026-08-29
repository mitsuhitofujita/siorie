import { Skeleton } from '@/components/ui/skeleton'
import { GoogleSignInButton } from '@/lib/auth'
import { useAuth } from '@/lib/auth-context'

// Guest-only view (guarded by <RequireGuest>). No common layout on purpose:
// the header's account image is the nav menu's only entry point, and there
// is no account before sign-in. A successful sign-in flips auth state to
// `authenticated`, and <RequireGuest> — not this page — sends the user on
// to /groups.
export function LoginPage() {
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
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 p-8 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">siorie</h1>
      <GoogleSignInButton />
    </main>
  )
}
