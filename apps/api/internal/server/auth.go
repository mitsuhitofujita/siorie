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

		claims, err := deps.verifier.Verify(ctx, input.Body.Credential)
		if err != nil {
			return nil, huma.Error401Unauthorized("invalid Google ID token")
		}

		user, err := deps.users.Upsert(ctx, claims.Sub, claims.Email, claims.Name, claims.PictureURL)
		if err != nil {
			return nil, huma.Error500InternalServerError("failed to save user")
		}

		// Also clear the same user's already-expired sessions from other
		// devices, per the proposal's session cleanup policy.
		if err := deps.sessions.DeleteExpiredForUser(ctx, user.Sub); err != nil {
			return nil, huma.Error500InternalServerError("failed to clean up sessions")
		}

		rawSessionID, err := deps.sessions.Create(ctx, user.Sub, sessionTTL)
		if err != nil {
			return nil, huma.Error500InternalServerError("failed to create session")
		}

		resp := &PostAuthGoogleOutput{}
		resp.SetCookie = newSessionCookie(rawSessionID).String()
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
