package server

import (
	"net/http"
	"net/url"
	"os"
	"path"
	"path/filepath"
	"strings"
)

// spaHandler serves the built SPA (apps/web/dist, copied into the deploy
// image) from webRoot and falls back to index.html for BrowserRouter deep
// links. Registered as the router's NotFound handler, so it only ever sees
// paths no API route matched.
//
// appOrigin is the canonical origin. Cloud Run assigns the service both a
// deterministic URL and a legacy hash URL; the SPA must run on the one
// APP_ORIGIN names, so a GET/HEAD arriving on any other host is redirected
// there. API paths are never redirected — they keep their status codes.
func spaHandler(webRoot, appOrigin string) http.HandlerFunc {
	indexFile := filepath.Join(webRoot, "index.html")

	// An unparseable or host-less APP_ORIGIN disables the redirect rather
	// than redirecting somewhere undefined.
	var canonicalHost string
	if u, err := url.Parse(appOrigin); err == nil {
		canonicalHost = u.Host
	}

	return func(w http.ResponseWriter, r *http.Request) {
		urlPath := r.URL.Path

		// Unregistered /api/* paths keep their plain 404; the SPA never
		// swallows an API typo into an index.html 200.
		if strings.HasPrefix(urlPath, "/api/") {
			http.NotFound(w, r)
			return
		}

		// Redirect on the Host header, not on Origin: only navigations
		// carry Origin. The target is built from APP_ORIGIN, never from
		// r.Host, so a forged Host cannot turn this into an open redirect.
		if (r.Method == http.MethodGet || r.Method == http.MethodHead) &&
			canonicalHost != "" && !strings.EqualFold(r.Host, canonicalHost) {
			// 302, not 301/308: the canonical URL can change back, and a
			// cached permanent redirect would be hard to undo.
			target := strings.TrimSuffix(appOrigin, "/") + r.URL.RequestURI()
			http.Redirect(w, r, target, http.StatusFound)
			return
		}

		// Clean rooted before joining so ".." cannot escape webRoot.
		rel := strings.TrimPrefix(path.Clean("/"+urlPath), "/")
		file := filepath.Join(webRoot, filepath.FromSlash(rel))
		isAsset := strings.HasPrefix(urlPath, "/assets/")

		if info, err := os.Stat(file); err == nil && !info.IsDir() {
			if isAsset {
				// Vite content-hashes everything under assets/, so a hit
				// there can be cached forever.
				w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
			} else {
				w.Header().Set("Cache-Control", "no-cache")
			}
			http.ServeFile(w, r, file)
			return
		}

		// A missing hashed asset means the browser holds a stale bundle;
		// answering it with index.html would only corrupt the module graph.
		if isAsset {
			http.NotFound(w, r)
			return
		}

		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			http.NotFound(w, r)
			return
		}

		// SPA fallback: /, /login, /groups/:groupId, … all get index.html
		// and the client router takes over. no-cache so a redeploy is
		// picked up on the next navigation.
		w.Header().Set("Cache-Control", "no-cache")
		http.ServeFile(w, r, indexFile)
	}
}
