package server

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"time"

	"github.com/danielgtaylor/huma/v2"

	"github.com/mitsuhitofujita/siorie/apps/api/internal/googleauth"
	"github.com/mitsuhitofujita/siorie/apps/api/internal/store"
)

const (
	sessionCookieName = "__Host-session"
	sessionTTL        = 30 * 24 * time.Hour
)

// authDeps are the dependencies the auth handlers need. appOrigin is the
// application's own origin (e.g. "http://localhost:5173" in local dev, the
// Cloud Run URL in production), used to validate the Origin header on
// state-changing requests as one layer of CSRF defense.
type authDeps struct {
	verifier  googleauth.Verifier
	users     store.UserStore
	sessions  store.SessionStore
	appOrigin string
}

type userBody struct {
	Name       string `json:"name" doc:"Display name"`
	PictureURL string `json:"pictureUrl" doc:"Profile picture URL"`
}

func registerAuthRoutes(api huma.API, deps authDeps) {
	type PostAuthGoogleInput struct {
		Origin string `header:"Origin"`
		Body   struct {
			Credential string `json:"credential" required:"true" doc:"Google ID Token from Google Identity Services"`
		}
	}
	type PostAuthGoogleOutput struct {
		SetCookie string `header:"Set-Cookie"`
		Body      userBody
	}

	huma.Register(api, huma.Operation{
		OperationID: "post-auth-google",
		Method:      http.MethodPost,
		Path:        "/api/auth/google",
		Summary:     "Sign in with a Google ID Token, creating or updating the local user and a session",
	}, func(ctx context.Context, input *PostAuthGoogleInput) (*PostAuthGoogleOutput, error) {
		if err := validateOrigin(input.Origin, deps.appOrigin); err != nil {
			return nil, huma.Error403Forbidden(err.Error())
		}

		cookie, user, err := establishSession(ctx, deps, input.Body.Credential)
		if errors.Is(err, errInvalidCredential) {
			return nil, huma.Error401Unauthorized("invalid Google ID token")
		} else if err != nil {
			return nil, huma.Error500InternalServerError("failed to sign in")
		}

		resp := &PostAuthGoogleOutput{}
		resp.SetCookie = cookie.String()
		resp.Body = userBody{Name: user.DisplayName, PictureURL: user.PictureURL}
		return resp, nil
	})

	type PostAuthLogoutInput struct {
		Origin  string `header:"Origin"`
		Session string `cookie:"__Host-session"`
	}
	type PostAuthLogoutOutput struct {
		SetCookie string `header:"Set-Cookie"`
	}

	huma.Register(api, huma.Operation{
		OperationID: "post-auth-logout",
		Method:      http.MethodPost,
		Path:        "/api/auth/logout",
		Summary:     "Delete the current session",
	}, func(ctx context.Context, input *PostAuthLogoutInput) (*PostAuthLogoutOutput, error) {
		if err := validateOrigin(input.Origin, deps.appOrigin); err != nil {
			return nil, huma.Error403Forbidden(err.Error())
		}

		if input.Session != "" {
			if err := deps.sessions.Delete(ctx, input.Session); err != nil {
				return nil, huma.Error500InternalServerError("failed to delete session")
			}
		}

		resp := &PostAuthLogoutOutput{}
		resp.SetCookie = clearedSessionCookie().String()
		return resp, nil
	})

	type GetMeInput struct {
		Session string `cookie:"__Host-session"`
	}
	type GetMeOutput struct {
		Body userBody
	}

	huma.Register(api, huma.Operation{
		OperationID: "get-me",
		Method:      http.MethodGet,
		Path:        "/api/me",
		Summary:     "Get the signed-in user",
	}, func(ctx context.Context, input *GetMeInput) (*GetMeOutput, error) {
		userID, err := authenticateSession(ctx, deps.sessions, input.Session)
		if err != nil {
			return nil, err
		}

		user, err := deps.users.Get(ctx, userID)
		if errors.Is(err, store.ErrUserNotFound) {
			return nil, huma.Error401Unauthorized("not authenticated")
		} else if err != nil {
			return nil, huma.Error500InternalServerError("failed to look up user")
		}

		resp := &GetMeOutput{}
		resp.Body = userBody{Name: user.DisplayName, PictureURL: user.PictureURL}
		return resp, nil
	})
}

// errInvalidCredential marks an establishSession failure caused by the
// credential itself (a missing or rejected token) rather than by a storage
// error, so the Google ID Token route can map it to 401 while every other
// failure becomes 500.
var errInvalidCredential = errors.New("server: invalid credential")

// establishSession runs the sign-in chain shared by the Google ID Token
// route (POST /api/auth/google) and the development-only dev-login route:
// verify the credential, upsert the user, drop that user's already-expired
// sessions, create a fresh session, and build the __Host-session cookie. On
// a nil error the returned cookie and user are both non-nil. A verify
// failure is wrapped as errInvalidCredential.
func establishSession(ctx context.Context, deps authDeps, credential string) (*http.Cookie, *store.User, error) {
	claims, err := deps.verifier.Verify(ctx, credential)
	if err != nil {
		return nil, nil, fmt.Errorf("%w: %v", errInvalidCredential, err)
	}

	user, err := deps.users.Upsert(ctx, claims.Sub, claims.Email, claims.Name, claims.PictureURL)
	if err != nil {
		return nil, nil, fmt.Errorf("upsert user: %w", err)
	}

	// Clear the same user's already-expired sessions from other devices,
	// per the proposal's session cleanup policy.
	if err := deps.sessions.DeleteExpiredForUser(ctx, user.Sub); err != nil {
		return nil, nil, fmt.Errorf("delete expired sessions: %w", err)
	}

	rawSessionID, err := deps.sessions.Create(ctx, user.Sub, sessionTTL)
	if err != nil {
		return nil, nil, fmt.Errorf("create session: %w", err)
	}

	return newSessionCookie(rawSessionID), user, nil
}

// devLoginHandler backs POST /api/auth/dev-login, a development-only sign-in
// that a plain HTML form can submit. The Huma /api/auth/google route only
// accepts a JSON body, which a top-level form navigation cannot send, so
// this is a separate plain route rather than the same URL. It is mounted
// only when AUTH_DEV_LOGIN=1 (see cmd/server/main.go), which also swaps the
// real Google verifier for a FakeVerifier returning fixed claims — so the
// empty credential passed here is ignored. The Origin check and the whole
// session-creation chain are the exact same code as the real route; only
// the URL and request format differ, and the response is a 302 to "/" for
// the form navigation instead of a JSON body.
func devLoginHandler(deps authDeps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if err := validateOrigin(r.Header.Get("Origin"), deps.appOrigin); err != nil {
			http.Error(w, err.Error(), http.StatusForbidden)
			return
		}

		cookie, _, err := establishSession(r.Context(), deps, "")
		if err != nil {
			http.Error(w, "dev login failed", http.StatusInternalServerError)
			return
		}

		http.SetCookie(w, cookie)
		http.Redirect(w, r, "/", http.StatusFound)
	}
}

// authenticateSession resolves a raw session cookie value to the signed-in
// user's ID, so route handlers don't each repeat the lookup-and-401 dance.
// It returns a huma.StatusError suitable for returning directly from a
// handler.
func authenticateSession(ctx context.Context, sessions store.SessionStore, rawSessionID string) (string, error) {
	if rawSessionID == "" {
		return "", huma.Error401Unauthorized("not authenticated")
	}

	session, err := sessions.Lookup(ctx, rawSessionID)
	if errors.Is(err, store.ErrSessionNotFound) {
		return "", huma.Error401Unauthorized("not authenticated")
	} else if err != nil {
		return "", huma.Error500InternalServerError("failed to look up session")
	}
	return session.UserID, nil
}

// validateOrigin checks that a state-changing request's Origin header
// matches the application's own origin. Combined with the same-origin
// deployment (SPA and API served from one Cloud Run service), the
// SameSite=Lax session cookie, and JSON-only bodies, this defends against
// CSRF without a separate token.
func validateOrigin(origin, appOrigin string) error {
	if origin == "" || origin != appOrigin {
		return fmt.Errorf("request Origin %q is not allowed", origin)
	}
	return nil
}

func newSessionCookie(rawSessionID string) *http.Cookie {
	return &http.Cookie{
		Name:     sessionCookieName,
		Value:    rawSessionID,
		Path:     "/",
		MaxAge:   int(sessionTTL.Seconds()),
		Secure:   true,
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
	}
}

func clearedSessionCookie() *http.Cookie {
	return &http.Cookie{
		Name:     sessionCookieName,
		Value:    "",
		Path:     "/",
		MaxAge:   -1,
		Secure:   true,
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
	}
}
