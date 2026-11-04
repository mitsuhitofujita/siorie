package server

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
)

// staticTestRouter builds a router over a throwaway webRoot holding an
// index.html, one hashed asset, and one top-level file, mirroring the shape
// of apps/web/dist.
func staticTestRouter(t *testing.T) http.Handler {
	t.Helper()

	webRoot := t.TempDir()
	writeFile := func(rel, content string) {
		t.Helper()
		p := filepath.Join(webRoot, rel)
		if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
			t.Fatalf("mkdir %s: %v", rel, err)
		}
		if err := os.WriteFile(p, []byte(content), 0o644); err != nil {
			t.Fatalf("write %s: %v", rel, err)
		}
	}
	writeFile("index.html", "<html>index</html>")
	writeFile("assets/app-abc123.js", "console.log('app')")
	writeFile("vite.svg", "<svg/>")

	deps := testDeps()
	deps.WebRoot = webRoot
	// The canonical origin the SPA is served from; requests in the tests
	// below carry this as their Host unless a case overrides it.
	deps.AppOrigin = "https://app.example.com"
	return NewRouter(deps)
}

func TestSPAHandler(t *testing.T) {
	router := staticTestRouter(t)

	tests := []struct {
		name         string
		method       string
		path         string
		wantStatus   int
		wantBody     string // "" means don't check
		wantCacheCtl string // "" means don't check
	}{
		{
			name:         "root serves index.html",
			method:       http.MethodGet,
			path:         "/",
			wantStatus:   http.StatusOK,
			wantBody:     "<html>index</html>",
			wantCacheCtl: "no-cache",
		},
		{
			name:         "deep link falls back to index.html",
			method:       http.MethodGet,
			path:         "/groups/abc123",
			wantStatus:   http.StatusOK,
			wantBody:     "<html>index</html>",
			wantCacheCtl: "no-cache",
		},
		{
			name:         "existing hashed asset is immutable",
			method:       http.MethodGet,
			path:         "/assets/app-abc123.js",
			wantStatus:   http.StatusOK,
			wantBody:     "console.log('app')",
			wantCacheCtl: "public, max-age=31536000, immutable",
		},
		{
			name:         "existing top-level file is no-cache",
			method:       http.MethodGet,
			path:         "/vite.svg",
			wantStatus:   http.StatusOK,
			wantBody:     "<svg/>",
			wantCacheCtl: "no-cache",
		},
		{
			name:       "missing hashed asset is 404, not index.html",
			method:     http.MethodGet,
			path:       "/assets/app-gone999.js",
			wantStatus: http.StatusNotFound,
		},
		{
			name:       "unregistered api path stays 404",
			method:     http.MethodGet,
			path:       "/api/nonexistent",
			wantStatus: http.StatusNotFound,
		},
		{
			name:       "non-GET unmatched path is 404",
			method:     http.MethodPost,
			path:       "/groups/abc123",
			wantStatus: http.StatusNotFound,
		},
		{
			// path.Clean strips the ".." before the join, and
			// http.ServeFile additionally rejects ".." URL paths with 400,
			// so nothing outside webRoot is reachable either way.
			name:       "path traversal cannot escape webRoot",
			method:     http.MethodGet,
			path:       "/../outside.txt",
			wantStatus: http.StatusBadRequest,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest(tt.method, tt.path, nil)
			req.Host = "app.example.com"
			rec := httptest.NewRecorder()
			router.ServeHTTP(rec, req)

			if rec.Code != tt.wantStatus {
				t.Fatalf("status = %d, want %d", rec.Code, tt.wantStatus)
			}
			if tt.wantBody != "" && rec.Body.String() != tt.wantBody {
				t.Fatalf("body = %q, want %q", rec.Body.String(), tt.wantBody)
			}
			if tt.wantCacheCtl != "" {
				if got := rec.Header().Get("Cache-Control"); got != tt.wantCacheCtl {
					t.Fatalf("Cache-Control = %q, want %q", got, tt.wantCacheCtl)
				}
			}
		})
	}
}

func TestSPAHandlerRedirectsNonCanonicalHost(t *testing.T) {
	router := staticTestRouter(t)

	tests := []struct {
		name         string
		method       string
		path         string
		host         string
		wantStatus   int
		wantLocation string // "" means don't check
	}{
		{
			name:         "GET deep link redirects to canonical host with path and query",
			method:       http.MethodGet,
			path:         "/groups/abc123?x=1",
			host:         "legacy.example.com",
			wantStatus:   http.StatusFound,
			wantLocation: "https://app.example.com/groups/abc123?x=1",
		},
		{
			name:       "unregistered api path stays 404 on a non-canonical host",
			method:     http.MethodGet,
			path:       "/api/nonexistent",
			host:       "legacy.example.com",
			wantStatus: http.StatusNotFound,
		},
		{
			name:       "non-GET path is not redirected on a non-canonical host",
			method:     http.MethodPost,
			path:       "/groups/abc123",
			host:       "legacy.example.com",
			wantStatus: http.StatusNotFound,
		},
		{
			name:       "HEAD redirects like GET",
			method:     http.MethodHead,
			path:       "/",
			host:       "legacy.example.com",
			wantStatus: http.StatusFound,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest(tt.method, tt.path, nil)
			req.Host = tt.host
			rec := httptest.NewRecorder()
			router.ServeHTTP(rec, req)

			if rec.Code != tt.wantStatus {
				t.Fatalf("status = %d, want %d", rec.Code, tt.wantStatus)
			}
			if tt.wantLocation != "" {
				if got := rec.Header().Get("Location"); got != tt.wantLocation {
					t.Fatalf("Location = %q, want %q", got, tt.wantLocation)
				}
			}
		})
	}
}

func TestSPAHandlerNotMountedWithoutWebRoot(t *testing.T) {
	router := NewRouter(testDeps())

	req := httptest.NewRequest(http.MethodGet, "/groups/abc123", nil)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusNotFound)
	}
}
