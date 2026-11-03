import { GoogleSignInButton } from '@/lib/auth'
import { useAuth } from '@/lib/auth-context'

// Guest-only view (guarded by <RequireGuest>). No common layout on purpose:
// the header's avatar is the nav menu's only entry point, and there is no
// account before sign-in. A successful sign-in flips auth state to
// `authenticated`, and <RequireGuest> — not this page — sends the user on to
// /groups. The Google-rendered button is the one control not restyled to the
// app palette (per 0004).
export function LoginPage() {
  const { state } = useAuth()

  if (state.status === 'loading') {
    return null
  }

  return (
    <main className="home">
      <h1 className="brand">siorie</h1>
      <p className="tagline">
        Keep track of which manga you've read, and how far.
      </p>
      <div className="home-card">
        <GoogleSignInButton />
        <span className="caption">
          Rendered by Google Identity Services — the one control not restyled.
        </span>
      </div>
      {import.meta.env.DEV && (
        // Development only: a plain HTML form (no JS) that a browser E2E
        // check can submit to sign in as a fixed test user. Vite strips this
        // from `vite build`; the backend route it posts to exists only when
        // AUTH_DEV_LOGIN=1. See docs/worklogs/0014-dev-login-path.
        <form className="dev-block" method="post" action="/api/auth/dev-login">
          <button type="submit" className="btn btn-outline btn-sm">
            Dev Login
          </button>
          <span className="caption">
            Development only — signs in as a fixed test user.
          </span>
        </form>
      )}
    </main>
  )
}
