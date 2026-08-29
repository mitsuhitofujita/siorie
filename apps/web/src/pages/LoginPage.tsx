import { Skeleton } from '@/components/Skeleton'
import { GoogleSignInButton } from '@/lib/auth'
import { useAuth } from '@/lib/auth-context'

// Guest-only view (guarded by <RequireGuest>). No common layout on purpose:
// the header's avatar is the nav menu's only entry point, and there is no
// account before sign-in. A successful sign-in flips auth state to
// `authenticated`, and <RequireGuest> — not this page — sends the user on to
// /groups. The Google-rendered button is the one control not restyled to the
// moss palette (per 0004).
export function LoginPage() {
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
    <main className="home">
      <h1 className="brand">siorie</h1>
      <p className="tagline">
        Keep track of which manga you've read, and how far.
      </p>
      <div className="signin">
        <GoogleSignInButton />
        <span className="caption">
          Rendered by Google Identity Services — the one control not restyled.
        </span>
      </div>
    </main>
  )
}
