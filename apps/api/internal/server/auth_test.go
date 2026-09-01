package server

import (
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/mitsuhitofujita/siorie/apps/api/internal/googleauth"
	"github.com/mitsuhitofujita/siorie/apps/api/internal/store"
)

const testOrigin = "http://localhost:5173"

func newTestRouter(t *testing.T, verifier googleauth.Verifier) (http.Handler, *store.MemoryStore) {
	t.Helper()
	mem := store.NewMemoryStore()
	router := NewRouter(Deps{
		Verifier:  verifier,
		Users:     mem,
		Sessions:  mem,
		Groups:    mem,
		Items:     mem,
		AppOrigin: testOrigin,
	})
	return router, mem
}

func decodeUserBody(t *testing.T, rec *httptest.ResponseRecorder) userBody {
	t.Helper()
	var body userBody
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("unmarshal response body: %v", err)
	}
	return body
}

func sessionCookieFrom(t *testing.T, rec *httptest.ResponseRecorder) *http.Cookie {
	t.Helper()
	for _, c := range rec.Result().Cookies() {
		if c.Name == sessionCookieName {
			return c
		}
	}
	t.Fatalf("no %s cookie in response", sessionCookieName)
	return nil
}

func newDevLoginRouter(t *testing.T) (http.Handler, *store.MemoryStore) {
	t.Helper()
	mem := store.NewMemoryStore()
	router := NewRouter(Deps{
		Verifier: &googleauth.FakeVerifier{Claims: &googleauth.Claims{
			Sub: "dev-test-user", Email: "dev-test-user@example.com", Name: "Dev Test User",
		}},
		Users:     mem,
		Sessions:  mem,
		Groups:    mem,
		Items:     mem,
		AppOrigin: testOrigin,
		DevLogin:  true,
	})
	return router, mem
}

func TestPostAuthGoogle_CreatesUserAndSession(t *testing.T) {
	verifier := &googleauth.FakeVerifier{Claims: &googleauth.Claims{
		Sub: "sub-123", Email: "user@example.com", Name: "Test User", PictureURL: "https://example.com/pic.png",
	}}
	router, _ := newTestRouter(t, verifier)

	req := httptest.NewRequest(http.MethodPost, "/api/auth/google", strings.NewReader(`{"credential":"fake-token"}`))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Origin", testOrigin)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d, body = %s", rec.Code, http.StatusOK, rec.Body.String())
	}

	body := decodeUserBody(t, rec)
	if body.Name != "Test User" || body.PictureURL != "https://example.com/pic.png" {
		t.Fatalf("body = %+v, want name/pictureUrl from claims", body)
	}

	cookie := sessionCookieFrom(t, rec)
	if cookie.Value == "" {
		t.Fatal("session cookie value is empty")
	}
	if !cookie.Secure || !cookie.HttpOnly || cookie.SameSite != http.SameSiteLaxMode || cookie.Path != "/" {
		t.Fatalf("cookie attributes = %+v, want Secure+HttpOnly+SameSite=Lax+Path=/", cookie)
	}
}

func TestPostAuthGoogle_RejectsWrongOrigin(t *testing.T) {
	verifier := &googleauth.FakeVerifier{Claims: &googleauth.Claims{Sub: "sub-123"}}
	router, _ := newTestRouter(t, verifier)

	req := httptest.NewRequest(http.MethodPost, "/api/auth/google", strings.NewReader(`{"credential":"fake-token"}`))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Origin", "https://evil.example.com")
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("status = %d, want %d, body = %s", rec.Code, http.StatusForbidden, rec.Body.String())
	}
}

func TestPostAuthGoogle_RejectsInvalidToken(t *testing.T) {
	verifier := &googleauth.FakeVerifier{Err: errors.New("invalid token")}
	router, _ := newTestRouter(t, verifier)

	req := httptest.NewRequest(http.MethodPost, "/api/auth/google", strings.NewReader(`{"credential":"bad-token"}`))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Origin", testOrigin)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want %d, body = %s", rec.Code, http.StatusUnauthorized, rec.Body.String())
	}
}

func TestGetMe_RequiresSession(t *testing.T) {
	router, _ := newTestRouter(t, &googleauth.FakeVerifier{})

	req := httptest.NewRequest(http.MethodGet, "/api/me", nil)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusUnauthorized)
	}
}

func TestLoginThenMeThenLogout(t *testing.T) {
	verifier := &googleauth.FakeVerifier{Claims: &googleauth.Claims{
		Sub: "sub-123", Name: "Test User", PictureURL: "https://example.com/pic.png",
	}}
	router, _ := newTestRouter(t, verifier)

	loginReq := httptest.NewRequest(http.MethodPost, "/api/auth/google", strings.NewReader(`{"credential":"fake-token"}`))
	loginReq.Header.Set("Content-Type", "application/json")
	loginReq.Header.Set("Origin", testOrigin)
	loginRec := httptest.NewRecorder()
	router.ServeHTTP(loginRec, loginReq)
	cookie := sessionCookieFrom(t, loginRec)

	meReq := httptest.NewRequest(http.MethodGet, "/api/me", nil)
	meReq.AddCookie(&http.Cookie{Name: sessionCookieName, Value: cookie.Value})
	meRec := httptest.NewRecorder()
	router.ServeHTTP(meRec, meReq)
	if meRec.Code != http.StatusOK {
		t.Fatalf("GET /api/me status = %d, want %d, body = %s", meRec.Code, http.StatusOK, meRec.Body.String())
	}
	if body := decodeUserBody(t, meRec); body.Name != "Test User" {
		t.Fatalf("GET /api/me body = %+v, want name Test User", body)
	}

	logoutReq := httptest.NewRequest(http.MethodPost, "/api/auth/logout", nil)
	logoutReq.Header.Set("Origin", testOrigin)
	logoutReq.AddCookie(&http.Cookie{Name: sessionCookieName, Value: cookie.Value})
	logoutRec := httptest.NewRecorder()
	router.ServeHTTP(logoutRec, logoutReq)
	// No Body field on the output means huma defaults to 204 No Content.
	if logoutRec.Code != http.StatusNoContent {
		t.Fatalf("POST /api/auth/logout status = %d, want %d, body = %s", logoutRec.Code, http.StatusNoContent, logoutRec.Body.String())
	}
	cleared := sessionCookieFrom(t, logoutRec)
	if cleared.MaxAge >= 0 {
		t.Fatalf("cleared cookie MaxAge = %d, want negative", cleared.MaxAge)
	}

	meAfterLogoutReq := httptest.NewRequest(http.MethodGet, "/api/me", nil)
	meAfterLogoutReq.AddCookie(&http.Cookie{Name: sessionCookieName, Value: cookie.Value})
	meAfterLogoutRec := httptest.NewRecorder()
	router.ServeHTTP(meAfterLogoutRec, meAfterLogoutReq)
	if meAfterLogoutRec.Code != http.StatusUnauthorized {
		t.Fatalf("GET /api/me after logout status = %d, want %d", meAfterLogoutRec.Code, http.StatusUnauthorized)
	}
}

func TestPostAuthDevLogin_CreatesSessionAndRedirects(t *testing.T) {
	router, _ := newDevLoginRouter(t)

	req := httptest.NewRequest(http.MethodPost, "/api/auth/dev-login", nil)
	req.Header.Set("Origin", testOrigin)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusFound {
		t.Fatalf("status = %d, want %d, body = %s", rec.Code, http.StatusFound, rec.Body.String())
	}
	if loc := rec.Header().Get("Location"); loc != "/" {
		t.Fatalf("Location = %q, want %q", loc, "/")
	}

	cookie := sessionCookieFrom(t, rec)
	if cookie.Value == "" {
		t.Fatal("session cookie value is empty")
	}
	if !cookie.Secure || !cookie.HttpOnly || cookie.SameSite != http.SameSiteLaxMode || cookie.Path != "/" {
		t.Fatalf("cookie attributes = %+v, want Secure+HttpOnly+SameSite=Lax+Path=/", cookie)
	}

	// The fixed dev user was persisted through the same chain as the real
	// route, so a follow-up GET /api/me with the cookie succeeds.
	meReq := httptest.NewRequest(http.MethodGet, "/api/me", nil)
	meReq.AddCookie(&http.Cookie{Name: sessionCookieName, Value: cookie.Value})
	meRec := httptest.NewRecorder()
	router.ServeHTTP(meRec, meReq)
	if meRec.Code != http.StatusOK {
		t.Fatalf("GET /api/me status = %d, want %d, body = %s", meRec.Code, http.StatusOK, meRec.Body.String())
	}
	if body := decodeUserBody(t, meRec); body.Name != "Dev Test User" {
		t.Fatalf("GET /api/me body = %+v, want name Dev Test User", body)
	}
}

func TestPostAuthDevLogin_RejectsWrongOrigin(t *testing.T) {
	router, _ := newDevLoginRouter(t)

	req := httptest.NewRequest(http.MethodPost, "/api/auth/dev-login", nil)
	req.Header.Set("Origin", "https://evil.example.com")
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusForbidden)
	}
}

func TestPostAuthDevLogin_AbsentWithoutDevLogin(t *testing.T) {
	verifier := &googleauth.FakeVerifier{Claims: &googleauth.Claims{Sub: "sub-123"}}
	router, _ := newTestRouter(t, verifier)

	req := httptest.NewRequest(http.MethodPost, "/api/auth/dev-login", nil)
	req.Header.Set("Origin", testOrigin)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want %d (route must not exist unless DevLogin is set)", rec.Code, http.StatusNotFound)
	}
}

func TestPostAuthLogout_RejectsWrongOrigin(t *testing.T) {
	router, _ := newTestRouter(t, &googleauth.FakeVerifier{})

	req := httptest.NewRequest(http.MethodPost, "/api/auth/logout", nil)
	req.Header.Set("Origin", "https://evil.example.com")
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusForbidden)
	}
}
