// Package server builds the HTTP router for the siorie API.
package server

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"
	"github.com/danielgtaylor/huma/v2/adapters/humachi"
	"github.com/go-chi/chi/v5"

	"github.com/mitsuhitofujita/siorie/apps/api/internal/googleauth"
	"github.com/mitsuhitofujita/siorie/apps/api/internal/store"
)

// HelloOutput is the response body for the hello endpoint.
type HelloOutput struct {
	Body struct {
		Message string `json:"message" example:"Hello, World!" doc:"Greeting message"`
	}
}

// Deps are the router's external dependencies.
type Deps struct {
	Verifier  googleauth.Verifier
	Users     store.UserStore
	Sessions  store.SessionStore
	Groups    store.GroupStore
	Items     store.ItemStore
	AppOrigin string

	// DevLogin mounts POST /api/auth/dev-login, a development-only sign-in
	// for browser end-to-end checks. Set from AUTH_DEV_LOGIN=1 in
	// cmd/server, which also swaps in a fake verifier. Never true in
	// production.
	DevLogin bool
}

// NewRouter builds the router with all API routes registered.
func NewRouter(deps Deps) http.Handler {
	router := chi.NewMux()
	api := humachi.New(router, huma.DefaultConfig("siorie API", "0.1.0"))

	aDeps := authDeps{
		verifier:  deps.Verifier,
		users:     deps.Users,
		sessions:  deps.Sessions,
		appOrigin: deps.AppOrigin,
	}
	registerAuthRoutes(api, aDeps)

	// Development-only: a plain chi route (not a Huma operation) so a plain
	// HTML form navigation can submit it. Absent unless explicitly enabled.
	if deps.DevLogin {
		router.Post("/api/auth/dev-login", devLoginHandler(aDeps))
	}

	registerGroupRoutes(api, groupsDeps{
		sessions:  deps.Sessions,
		groups:    deps.Groups,
		appOrigin: deps.AppOrigin,
	})

	registerItemRoutes(api, itemsDeps{
		sessions:  deps.Sessions,
		groups:    deps.Groups,
		items:     deps.Items,
		appOrigin: deps.AppOrigin,
	})

	huma.Register(api, huma.Operation{
		OperationID: "get-hello",
		Method:      http.MethodGet,
		Path:        "/api/hello",
		Summary:     "Get a Hello World greeting",
	}, func(ctx context.Context, input *struct{}) (*HelloOutput, error) {
		resp := &HelloOutput{}
		resp.Body.Message = "Hello, World!"
		return resp, nil
	})

	return router
}
