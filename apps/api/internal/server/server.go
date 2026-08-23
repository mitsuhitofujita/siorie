// Package server builds the HTTP router for the siorie API.
package server

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"
	"github.com/danielgtaylor/huma/v2/adapters/humachi"
	"github.com/go-chi/chi/v5"
)

// HelloOutput is the response body for the hello endpoint.
type HelloOutput struct {
	Body struct {
		Message string `json:"message" example:"Hello, World!" doc:"Greeting message"`
	}
}

// NewRouter builds the router with all API routes registered.
func NewRouter() http.Handler {
	router := chi.NewMux()
	api := humachi.New(router, huma.DefaultConfig("siorie API", "0.1.0"))

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
