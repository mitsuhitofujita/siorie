package server

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/mitsuhitofujita/siorie/apps/api/internal/googleauth"
	"github.com/mitsuhitofujita/siorie/apps/api/internal/store"
)

func testDeps() Deps {
	mem := store.NewMemoryStore()
	return Deps{
		Verifier:  &googleauth.FakeVerifier{},
		Users:     mem,
		Sessions:  mem,
		Groups:    mem,
		AppOrigin: "http://localhost:5173",
	}
}

func TestGetHello(t *testing.T) {
	router := NewRouter(testDeps())

	req := httptest.NewRequest(http.MethodGet, "/api/hello", nil)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusOK)
	}

	contentType := rec.Header().Get("Content-Type")
	if contentType != "application/json" {
		t.Fatalf("Content-Type = %q, want %q", contentType, "application/json")
	}

	var body struct {
		Message string `json:"message"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("unmarshal response body: %v", err)
	}
	if body.Message != "Hello, World!" {
		t.Fatalf("message = %q, want %q", body.Message, "Hello, World!")
	}
}
