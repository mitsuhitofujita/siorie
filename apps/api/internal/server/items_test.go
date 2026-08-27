package server

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/mitsuhitofujita/siorie/apps/api/internal/googleauth"
)

func createTestGroup(t *testing.T, router http.Handler, cookie *http.Cookie) groupBody {
	t.Helper()
	rec := doGroupRequest(t, router, http.MethodPost, "/api/groups", cookie, `{"name":"manga cafe"}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("create group: status = %d, want %d, body = %s", rec.Code, http.StatusOK, rec.Body.String())
	}
	return decodeGroupBody(t, rec)
}

func decodeItemBody(t *testing.T, rec *httptest.ResponseRecorder) itemBody {
	t.Helper()
	var body itemBody
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("unmarshal response body: %v, body = %s", err, rec.Body.String())
	}
	return body
}

func TestItems_RequireAuth(t *testing.T) {
	router, _ := newTestRouter(t, &googleauth.FakeVerifier{})

	for _, tc := range []struct {
		method, path string
	}{
		{http.MethodGet, "/api/groups/g1/items"},
		{http.MethodPost, "/api/groups/g1/items"},
		{http.MethodGet, "/api/groups/g1/items/i1"},
		{http.MethodPatch, "/api/groups/g1/items/i1"},
		{http.MethodDelete, "/api/groups/g1/items/i1"},
	} {
		rec := doGroupRequest(t, router, tc.method, tc.path, nil, `{"title":"ONE PIECE","completedVolume":100}`)
		if rec.Code != http.StatusUnauthorized {
			t.Fatalf("%s %s: status = %d, want %d, body = %s", tc.method, tc.path, rec.Code, http.StatusUnauthorized, rec.Body.String())
		}
	}
}

func TestItems_StateChangingRoutesRejectWrongOrigin(t *testing.T) {
	router, _ := newTestRouter(t, &googleauth.FakeVerifier{Claims: &googleauth.Claims{Sub: "sub-1"}})
	cookie := loginAndGetCookie(t, router)

	for _, tc := range []struct {
		method, path string
	}{
		{http.MethodPost, "/api/groups/g1/items"},
		{http.MethodPatch, "/api/groups/g1/items/i1"},
		{http.MethodDelete, "/api/groups/g1/items/i1"},
	} {
		req := httptest.NewRequest(tc.method, tc.path, strings.NewReader(`{"title":"ONE PIECE","completedVolume":100}`))
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

func TestItems_RequireExistingGroup(t *testing.T) {
	router, _ := newTestRouter(t, &googleauth.FakeVerifier{Claims: &googleauth.Claims{Sub: "sub-1"}})
	cookie := loginAndGetCookie(t, router)

	for _, tc := range []struct {
		method, path, body string
	}{
		{http.MethodGet, "/api/groups/no-such-group/items", ""},
		{http.MethodPost, "/api/groups/no-such-group/items", `{"title":"ONE PIECE","completedVolume":100}`},
		{http.MethodGet, "/api/groups/no-such-group/items/i1", ""},
		{http.MethodPatch, "/api/groups/no-such-group/items/i1", `{"title":"ONE PIECE","completedVolume":100}`},
		{http.MethodDelete, "/api/groups/no-such-group/items/i1", ""},
	} {
		rec := doGroupRequest(t, router, tc.method, tc.path, cookie, tc.body)
		if rec.Code != http.StatusNotFound {
			t.Fatalf("%s %s: status = %d, want %d, body = %s", tc.method, tc.path, rec.Code, http.StatusNotFound, rec.Body.String())
		}
	}
}

func TestItems_EmptyListInitially(t *testing.T) {
	router, _ := newTestRouter(t, &googleauth.FakeVerifier{Claims: &googleauth.Claims{Sub: "sub-1"}})
	cookie := loginAndGetCookie(t, router)
	group := createTestGroup(t, router, cookie)

	rec := doGroupRequest(t, router, http.MethodGet, "/api/groups/"+group.ID+"/items", cookie, "")
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d, body = %s", rec.Code, http.StatusOK, rec.Body.String())
	}
	var items []itemBody
	if err := json.Unmarshal(rec.Body.Bytes(), &items); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if len(items) != 0 {
		t.Fatalf("items = %+v, want empty", items)
	}
}

func TestItems_CreateGetUpdateDelete(t *testing.T) {
	router, _ := newTestRouter(t, &googleauth.FakeVerifier{Claims: &googleauth.Claims{Sub: "sub-1"}})
	cookie := loginAndGetCookie(t, router)
	group := createTestGroup(t, router, cookie)

	createRec := doGroupRequest(t, router, http.MethodPost, "/api/groups/"+group.ID+"/items", cookie, `{"title":"ONE PIECE","completedVolume":100}`)
	if createRec.Code != http.StatusOK {
		t.Fatalf("create: status = %d, want %d, body = %s", createRec.Code, http.StatusOK, createRec.Body.String())
	}
	created := decodeItemBody(t, createRec)
	if created.Title != "ONE PIECE" || created.CompletedVolume != 100 || created.ID == "" {
		t.Fatalf("created = %+v, want title=ONE PIECE, completedVolume=100, non-empty id", created)
	}

	getRec := doGroupRequest(t, router, http.MethodGet, "/api/groups/"+group.ID+"/items/"+created.ID, cookie, "")
	if getRec.Code != http.StatusOK {
		t.Fatalf("get: status = %d, want %d, body = %s", getRec.Code, http.StatusOK, getRec.Body.String())
	}
	if got := decodeItemBody(t, getRec); got != created {
		t.Fatalf("get = %+v, want %+v", got, created)
	}

	listRec := doGroupRequest(t, router, http.MethodGet, "/api/groups/"+group.ID+"/items", cookie, "")
	var items []itemBody
	if err := json.Unmarshal(listRec.Body.Bytes(), &items); err != nil {
		t.Fatalf("unmarshal list: %v", err)
	}
	if len(items) != 1 || items[0] != created {
		t.Fatalf("list = %+v, want [%+v]", items, created)
	}

	updateRec := doGroupRequest(t, router, http.MethodPatch, "/api/groups/"+group.ID+"/items/"+created.ID, cookie, `{"title":"ONE PIECE","completedVolume":105}`)
	if updateRec.Code != http.StatusOK {
		t.Fatalf("update: status = %d, want %d, body = %s", updateRec.Code, http.StatusOK, updateRec.Body.String())
	}
	updated := decodeItemBody(t, updateRec)
	if updated.CompletedVolume != 105 || updated.ID != created.ID {
		t.Fatalf("updated = %+v, want completedVolume=105 with same id", updated)
	}

	deleteRec := doGroupRequest(t, router, http.MethodDelete, "/api/groups/"+group.ID+"/items/"+created.ID, cookie, "")
	if deleteRec.Code != http.StatusNoContent {
		t.Fatalf("delete: status = %d, want %d, body = %s", deleteRec.Code, http.StatusNoContent, deleteRec.Body.String())
	}

	getAfterDeleteRec := doGroupRequest(t, router, http.MethodGet, "/api/groups/"+group.ID+"/items/"+created.ID, cookie, "")
	if getAfterDeleteRec.Code != http.StatusNotFound {
		t.Fatalf("get after delete: status = %d, want %d", getAfterDeleteRec.Code, http.StatusNotFound)
	}
}

func TestItems_DeleteIsIdempotent(t *testing.T) {
	router, _ := newTestRouter(t, &googleauth.FakeVerifier{Claims: &googleauth.Claims{Sub: "sub-1"}})
	cookie := loginAndGetCookie(t, router)
	group := createTestGroup(t, router, cookie)

	createRec := doGroupRequest(t, router, http.MethodPost, "/api/groups/"+group.ID+"/items", cookie, `{"title":"ONE PIECE","completedVolume":100}`)
	created := decodeItemBody(t, createRec)

	for i := 0; i < 2; i++ {
		rec := doGroupRequest(t, router, http.MethodDelete, "/api/groups/"+group.ID+"/items/"+created.ID, cookie, "")
		if rec.Code != http.StatusNoContent {
			t.Fatalf("delete #%d: status = %d, want %d, body = %s", i+1, rec.Code, http.StatusNoContent, rec.Body.String())
		}
	}
}

func TestItems_GetAndUpdateMissingItem(t *testing.T) {
	router, _ := newTestRouter(t, &googleauth.FakeVerifier{Claims: &googleauth.Claims{Sub: "sub-1"}})
	cookie := loginAndGetCookie(t, router)
	group := createTestGroup(t, router, cookie)

	getRec := doGroupRequest(t, router, http.MethodGet, "/api/groups/"+group.ID+"/items/no-such-id", cookie, "")
	if getRec.Code != http.StatusNotFound {
		t.Fatalf("get: status = %d, want %d, body = %s", getRec.Code, http.StatusNotFound, getRec.Body.String())
	}

	updateRec := doGroupRequest(t, router, http.MethodPatch, "/api/groups/"+group.ID+"/items/no-such-id", cookie, `{"title":"x","completedVolume":0}`)
	if updateRec.Code != http.StatusNotFound {
		t.Fatalf("update: status = %d, want %d, body = %s", updateRec.Code, http.StatusNotFound, updateRec.Body.String())
	}
}

func TestItems_DeleteMissingItemUnderExistingGroupIsNoContent(t *testing.T) {
	router, _ := newTestRouter(t, &googleauth.FakeVerifier{Claims: &googleauth.Claims{Sub: "sub-1"}})
	cookie := loginAndGetCookie(t, router)
	group := createTestGroup(t, router, cookie)

	rec := doGroupRequest(t, router, http.MethodDelete, "/api/groups/"+group.ID+"/items/no-such-id", cookie, "")
	if rec.Code != http.StatusNoContent {
		t.Fatalf("status = %d, want %d, body = %s", rec.Code, http.StatusNoContent, rec.Body.String())
	}
}

func TestItems_CreateRejectsInvalidTitleOrVolume(t *testing.T) {
	router, _ := newTestRouter(t, &googleauth.FakeVerifier{Claims: &googleauth.Claims{Sub: "sub-1"}})
	cookie := loginAndGetCookie(t, router)
	group := createTestGroup(t, router, cookie)

	for _, tc := range []struct {
		name, body string
	}{
		{"empty title", `{"title":"","completedVolume":0}`},
		{"too long title", `{"title":"` + strings.Repeat("a", 101) + `","completedVolume":0}`},
		{"negative volume", `{"title":"ONE PIECE","completedVolume":-1}`},
	} {
		rec := doGroupRequest(t, router, http.MethodPost, "/api/groups/"+group.ID+"/items", cookie, tc.body)
		if rec.Code != http.StatusUnprocessableEntity {
			t.Fatalf("%s: status = %d, want %d, body = %s", tc.name, rec.Code, http.StatusUnprocessableEntity, rec.Body.String())
		}
	}
}

func TestItems_ScopedPerUser(t *testing.T) {
	router, mem := newTestRouter(t, &googleauth.FakeVerifier{Claims: &googleauth.Claims{Sub: "sub-1"}})
	cookieA := loginAndGetCookie(t, router)
	group := createTestGroup(t, router, cookieA)
	createRec := doGroupRequest(t, router, http.MethodPost, "/api/groups/"+group.ID+"/items", cookieA, `{"title":"ONE PIECE","completedVolume":100}`)
	created := decodeItemBody(t, createRec)

	// Mint a session for a second user directly in the store and confirm
	// they can't see or touch user A's items, since user A's group isn't
	// visible to them (GetGroup 404s before the item is ever looked up).
	rawSessionID, err := mem.Create(t.Context(), "sub-2", sessionTTL)
	if err != nil {
		t.Fatalf("create session for sub-2: %v", err)
	}
	cookieB := &http.Cookie{Value: rawSessionID}

	listRec := doGroupRequest(t, router, http.MethodGet, "/api/groups/"+group.ID+"/items", cookieB, "")
	if listRec.Code != http.StatusNotFound {
		t.Fatalf("user B list user A's group items: status = %d, want %d", listRec.Code, http.StatusNotFound)
	}

	getRec := doGroupRequest(t, router, http.MethodGet, "/api/groups/"+group.ID+"/items/"+created.ID, cookieB, "")
	if getRec.Code != http.StatusNotFound {
		t.Fatalf("user B get user A's item: status = %d, want %d", getRec.Code, http.StatusNotFound)
	}
}
