package server

import (
	"net/http"
	"os"
	"path"
	"path/filepath"
	"strings"
)

// spaHandler serves the built SPA (apps/web/dist, copied into the deploy
// image) from webRoot and falls back to index.html for BrowserRouter deep
// links. Registered as the router's NotFound handler, so it only ever sees
// paths no API route matched.
func spaHandler(webRoot string) http.HandlerFunc {
	indexFile := filepath.Join(webRoot, "index.html")

	return func(w http.ResponseWriter, r *http.Request) {
		urlPath := r.URL.Path

		// Unregistered /api/* paths keep their plain 404; the SPA never
		// swallows an API typo into an index.html 200.
		if strings.HasPrefix(urlPath, "/api/") {
			http.NotFound(w, r)
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
