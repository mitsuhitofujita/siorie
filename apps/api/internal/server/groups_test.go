package server

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/mitsuhitofujita/siorie/apps/api/internal/googleauth"
)

// loginAndGetCookie logs a test user in and returns the resulting session
// cookie, for tests that exercise routes requiring authentication.
func loginAndGetCookie(t *testing.T, router http.Handler) *http.Cookie {
	t.Helper()
	req := httptest.NewRequest(http.MethodPost, "/api/auth/google", strings.NewReader(`{"credential":"fake-token"}`))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Origin", testOrigin)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("login: status = %d, want %d, body = %s", rec.Code, http.StatusOK, rec.Body.String())
	}
	return sessionCookieFrom(t, rec)
}

func doGroupRequest(t *testing.T, router http.Handler, method, path string, cookie *http.Cookie, body string) *httptest.ResponseRecorder {
	t.Helper()
	var reader *strings.Reader
	if body != "" {
		reader = strings.NewReader(body)
	} else {
		reader = strings.NewReader("")
	}
	req := httptest.NewRequest(method, path, reader)
	if body != "" {
		req.Header.Set("Content-Type", "application/json")
	}
	if method != http.MethodGet {
		req.Header.Set("Origin", testOrigin)
	}
	if cookie != nil {
		req.AddCookie(&http.Cookie{Name: sessionCookieName, Value: cookie.Value})
	}
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	return rec
}

func decodeGroupBody(t *testing.T, rec *httptest.ResponseRecorder) groupBody {
	t.Helper()
	var body groupBody
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("unmarshal response body: %v, body = %s", err, rec.Body.String())
	}
	return body
}

func TestGroups_RequireAuth(t *testing.T) {
	router, _ := newTestRouter(t, &googleauth.FakeVerifier{})

	for _, tc := range []struct {
		method, path string
	}{
		{http.MethodGet, "/api/groups"},
		{http.MethodPost, "/api/groups"},
		{http.MethodGet, "/api/groups/g1"},
		{http.MethodPatch, "/api/groups/g1"},
		{http.MethodDelete, "/api/groups/g1"},
	} {
		rec := doGroupRequest(t, router, tc.method, tc.path, nil, `{"name":"manga cafe"}`)
		if rec.Code != http.StatusUnauthorized {
			t.Fatalf("%s %s: status = %d, want %d, body = %s", tc.method, tc.path, rec.Code, http.StatusUnauthorized, rec.Body.String())
		}
	}
}

func TestGroups_StateChangingRoutesRejectWrongOrigin(t *testing.T) {
	router, _ := newTestRouter(t, &googleauth.FakeVerifier{Claims: &googleauth.Claims{Sub: "sub-1"}})
	cookie := loginAndGetCookie(t, router)

	for _, tc := range []struct {
		method, path string
	}{
		{http.MethodPost, "/api/groups"},
		{http.MethodPatch, "/api/groups/g1"},
		{http.MethodDelete, "/api/groups/g1"},
	} {
		req := httptest.NewRequest(tc.method, tc.path, strings.NewReader(`{"name":"manga cafe"}`))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Origin", "https://evil.example.com")
		req.AddCookie(&http.Cookie{Name: sessionCookieName, Value: cookie.Value})
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, req)
		if rec.Code != http.StatusForbidden {
			t.Fatalf("%s %s: status = %d, want %d, body = %s", tc.method, tc.path, rec.Code, http.StatusForbidden, rec.Body.String())
		}
	}
}

func TestGroups_EmptyListInitially(t *testing.T) {
	router, _ := newTestRouter(t, &googleauth.FakeVerifier{Claims: &googleauth.Claims{Sub: "sub-1"}})
	cookie := loginAndGetCookie(t, router)

	rec := doGroupRequest(t, router, http.MethodGet, "/api/groups", cookie, "")
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d, body = %s", rec.Code, http.StatusOK, rec.Body.String())
	}
	var groups []groupBody
	if err := json.Unmarshal(rec.Body.Bytes(), &groups); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if len(groups) != 0 {
		t.Fatalf("groups = %+v, want empty", groups)
	}
}

func TestGroups_CreateGetUpdateDelete(t *testing.T) {
	router, _ := newTestRouter(t, &googleauth.FakeVerifier{Claims: &googleauth.Claims{Sub: "sub-1"}})
	cookie := loginAndGetCookie(t, router)

	createRec := doGroupRequest(t, router, http.MethodPost, "/api/groups", cookie, `{"name":"manga cafe"}`)
	if createRec.Code != http.StatusOK {
		t.Fatalf("create: status = %d, want %d, body = %s", createRec.Code, http.StatusOK, createRec.Body.String())
	}
	created := decodeGroupBody(t, createRec)
	if created.Name != "manga cafe" || created.ID == "" {
		t.Fatalf("created = %+v, want name=manga cafe and a non-empty id", created)
	}

	getRec := doGroupRequest(t, router, http.MethodGet, "/api/groups/"+created.ID, cookie, "")
	if getRec.Code != http.StatusOK {
		t.Fatalf("get: status = %d, want %d, body = %s", getRec.Code, http.StatusOK, getRec.Body.String())
	}
	if got := decodeGroupBody(t, getRec); got != created {
		t.Fatalf("get = %+v, want %+v", got, created)
	}

	listRec := doGroupRequest(t, router, http.MethodGet, "/api/groups", cookie, "")
	var groups []groupBody
	if err := json.Unmarshal(listRec.Body.Bytes(), &groups); err != nil {
		t.Fatalf("unmarshal list: %v", err)
	}
	if len(groups) != 1 || groups[0] != created {
		t.Fatalf("list = %+v, want [%+v]", groups, created)
	}

	updateRec := doGroupRequest(t, router, http.MethodPatch, "/api/groups/"+created.ID, cookie, `{"name":"purchased"}`)
	if updateRec.Code != http.StatusOK {
		t.Fatalf("update: status = %d, want %d, body = %s", updateRec.Code, http.StatusOK, updateRec.Body.String())
	}
	updated := decodeGroupBody(t, updateRec)
	if updated.Name != "purchased" || updated.ID != created.ID {
		t.Fatalf("updated = %+v, want name=purchased with same id", updated)
	}

	deleteRec := doGroupRequest(t, router, http.MethodDelete, "/api/groups/"+created.ID, cookie, "")
	if deleteRec.Code != http.StatusNoContent {
		t.Fatalf("delete: status = %d, want %d, body = %s", deleteRec.Code, http.StatusNoContent, deleteRec.Body.String())
	}

	getAfterDeleteRec := doGroupRequest(t, router, http.MethodGet, "/api/groups/"+created.ID, cookie, "")
	if getAfterDeleteRec.Code != http.StatusNotFound {
		t.Fatalf("get after delete: status = %d, want %d", getAfterDeleteRec.Code, http.StatusNotFound)
	}
}

func TestGroups_DeleteIsIdempotent(t *testing.T) {
	router, _ := newTestRouter(t, &googleauth.FakeVerifier{Claims: &googleauth.Claims{Sub: "sub-1"}})
	cookie := loginAndGetCookie(t, router)

	createRec := doGroupRequest(t, router, http.MethodPost, "/api/groups", cookie, `{"name":"manga cafe"}`)
	created := decodeGroupBody(t, createRec)

	for i := 0; i < 2; i++ {
		rec := doGroupRequest(t, router, http.MethodDelete, "/api/groups/"+created.ID, cookie, "")
		if rec.Code != http.StatusNoContent {
			t.Fatalf("delete #%d: status = %d, want %d, body = %s", i+1, rec.Code, http.StatusNoContent, rec.Body.String())
		}
	}
}

func TestGroups_GetAndUpdateMissingGroup(t *testing.T) {
	router, _ := newTestRouter(t, &googleauth.FakeVerifier{Claims: &googleauth.Claims{Sub: "sub-1"}})
	cookie := loginAndGetCookie(t, router)

	getRec := doGroupRequest(t, router, http.MethodGet, "/api/groups/no-such-id", cookie, "")
	if getRec.Code != http.StatusNotFound {
		t.Fatalf("get: status = %d, want %d, body = %s", getRec.Code, http.StatusNotFound, getRec.Body.String())
	}

	updateRec := doGroupRequest(t, router, http.MethodPatch, "/api/groups/no-such-id", cookie, `{"name":"x"}`)
	if updateRec.Code != http.StatusNotFound {
		t.Fatalf("update: status = %d, want %d, body = %s", updateRec.Code, http.StatusNotFound, updateRec.Body.String())
	}
}

func TestGroups_CreateRejectsEmptyOrTooLongName(t *testing.T) {
	router, _ := newTestRouter(t, &googleauth.FakeVerifier{Claims: &googleauth.Claims{Sub: "sub-1"}})
	cookie := loginAndGetCookie(t, router)

	emptyRec := doGroupRequest(t, router, http.MethodPost, "/api/groups", cookie, `{"name":""}`)
	if emptyRec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("empty name: status = %d, want %d, body = %s", emptyRec.Code, http.StatusUnprocessableEntity, emptyRec.Body.String())
	}

	tooLong := `{"name":"` + strings.Repeat("a", 101) + `"}`
	tooLongRec := doGroupRequest(t, router, http.MethodPost, "/api/groups", cookie, tooLong)
	if tooLongRec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("101-char name: status = %d, want %d, body = %s", tooLongRec.Code, http.StatusUnprocessableEntity, tooLongRec.Body.String())
	}
}

func TestGroups_ScopedPerUser(t *testing.T) {
	router, mem := newTestRouter(t, &googleauth.FakeVerifier{Claims: &googleauth.Claims{Sub: "sub-1"}})
	cookieA := loginAndGetCookie(t, router)

	createRec := doGroupRequest(t, router, http.MethodPost, "/api/groups", cookieA, `{"name":"user A's group"}`)
	created := decodeGroupBody(t, createRec)

	// Mint a session for a second user directly in the store (the router's
	// FakeVerifier always returns sub-1, so a real /api/auth/google login
	// can't authenticate as sub-2) and confirm they can't see or touch user
	// A's group.
	rawSessionID, err := mem.Create(t.Context(), "sub-2", sessionTTL)
	if err != nil {
		t.Fatalf("create session for sub-2: %v", err)
	}

	listRec := doGroupRequest(t, router, http.MethodGet, "/api/groups", &http.Cookie{Value: rawSessionID}, "")
	var groups []groupBody
	if err := json.Unmarshal(listRec.Body.Bytes(), &groups); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if len(groups) != 0 {
		t.Fatalf("user B's groups = %+v, want empty (user A's group must not leak)", groups)
	}

	getRec := doGroupRequest(t, router, http.MethodGet, "/api/groups/"+created.ID, &http.Cookie{Value: rawSessionID}, "")
	if getRec.Code != http.StatusNotFound {
		t.Fatalf("user B get user A's group: status = %d, want %d", getRec.Code, http.StatusNotFound)
	}
}
