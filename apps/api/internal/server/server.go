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
	AppOrigin string
}

// NewRouter builds the router with all API routes registered.
func NewRouter(deps Deps) http.Handler {
	router := chi.NewMux()
	api := humachi.New(router, huma.DefaultConfig("siorie API", "0.1.0"))

	registerAuthRoutes(api, authDeps{
		verifier:  deps.Verifier,
		users:     deps.Users,
		sessions:  deps.Sessions,
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
