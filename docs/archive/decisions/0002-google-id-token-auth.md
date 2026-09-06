# 0002: Google ID Token authentication with Firestore-backed sessions

Discussions: [purpose and initial tech stack](../discussions/0001-purpose-and-initial-tech-stack/proposal.md), [Google auth discovery](../discussions/0007-google-auth/discovery.md)
Worklog: [Google authentication](../worklogs/0003-google-auth/README.md)

## Status

Accepted.

## Decision

- Authentication uses the Google Identity Services ID Token flow only. The frontend never renders a
  custom sign-in control wired to `google.accounts.id.prompt()` (One Tap); it always renders Google's
  own `renderButton()` output, since `prompt()` is meant for automatic display on page load and has no
  fallback path when a FedCM-based sign-in can't complete.
- The Go API verifies every ID Token's signature, `aud`, `iss`, and `exp` before trusting it. Google's
  official Go client library (`google.golang.org/api/idtoken`) checks the signature, `aud`, and `exp`;
  the API adds an explicit `iss` check itself, since the library does not perform one.
- No OAuth client secret is used anywhere in this flow — not in the browser, not in the API container.
  A client ID is sufficient for ID Token verification.
- Sessions are opaque, server-side, and Firestore-backed: a cryptographically random session ID is
  handed to the browser as a `__Host-session` cookie (`Secure`, `HttpOnly`, `SameSite=Lax`, `Path=/`,
  30-day expiry); only the SHA-256 hash of that ID is stored in Firestore, never the raw value.
- State-changing auth endpoints (`POST /api/auth/google`, `POST /api/auth/logout`) validate the
  `Origin` request header against the application's own origin, on top of the same-origin deployment
  and `SameSite=Lax` cookie, as CSRF defense.
- Firestore documents follow `users/{googleSub}` and `sessions/{sha256(sessionId)}`, matching the tech-
  stack proposal's data model exactly. `sessions` documents are looked up and cleaned up by a single
  equality filter on `userId`, deliberately avoiding a composite index.

## Rationale

The ID Token flow keeps the client secret out of the browser and the container entirely, matching the
tech-stack proposal's explicit requirement, and needs no redirect or callback route. Verifying `iss` in
addition to what the official library already checks closes a real gap between the proposal's stated
verification requirements and the library's actual behavior. Storing only a session hash means a
Firestore data leak alone cannot be used to forge a valid session cookie. Google's own rendered button
was adopted over One Tap after `prompt()`, triggered from an app-styled button's click handler, was
found to fail silently with no user-visible feedback regardless of Cloud Console configuration —
`renderButton()` is the flow Google actually supports for an explicit, user-initiated sign-in.
