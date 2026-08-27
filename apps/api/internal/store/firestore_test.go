package store

import (
	"context"
	"os"
	"testing"
	"time"

	"cloud.google.com/go/firestore"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

// newTestFirestoreStore connects to the Firestore emulator for an
// integration test, or skips the test if FIRESTORE_EMULATOR_HOST is unset
// (e.g. `just apps/api/test` starts the emulator; a bare `go test` does
// not). See apps/api/justfile for how to run the emulator locally.
func newTestFirestoreStore(t *testing.T) *FirestoreStore {
	t.Helper()
	if os.Getenv("FIRESTORE_EMULATOR_HOST") == "" {
		t.Skip("FIRESTORE_EMULATOR_HOST is not set; run `just apps/api/test` to include the emulator")
	}

	ctx := context.Background()
	client, err := firestore.NewClient(ctx, "siorie-test")
	if err != nil {
		t.Fatalf("firestore.NewClient: %v", err)
	}
	t.Cleanup(func() { client.Close() })

	return &FirestoreStore{Client: client}
}

func TestFirestoreStore_UpsertThenGet(t *testing.T) {
	s := newTestFirestoreStore(t)
	ctx := context.Background()
	sub := "sub-upsert-" + t.Name()

	created, err := s.Upsert(ctx, sub, "user@example.com", "Test User", "https://example.com/pic.png")
	if err != nil {
		t.Fatalf("Upsert (create): %v", err)
	}
	if created.CreatedAt.IsZero() || created.UpdatedAt.IsZero() {
		t.Fatalf("created user timestamps not set: %+v", created)
	}

	updated, err := s.Upsert(ctx, sub, "user2@example.com", "Updated Name", "https://example.com/pic2.png")
	if err != nil {
		t.Fatalf("Upsert (update): %v", err)
	}
	if !updated.CreatedAt.Equal(created.CreatedAt) {
		t.Fatalf("CreatedAt changed on update: got %v, want %v", updated.CreatedAt, created.CreatedAt)
	}
	if updated.Email != "user2@example.com" || updated.DisplayName != "Updated Name" {
		t.Fatalf("Upsert did not refresh fields: %+v", updated)
	}

	got, err := s.Get(ctx, sub)
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	if got.Email != "user2@example.com" {
		t.Fatalf("Get returned stale data: %+v", got)
	}
}

func TestFirestoreStore_GetMissingUser(t *testing.T) {
	s := newTestFirestoreStore(t)
	ctx := context.Background()

	_, err := s.Get(ctx, "no-such-sub-"+t.Name())
	if err != ErrUserNotFound {
		t.Fatalf("Get missing user: err = %v, want ErrUserNotFound", err)
	}
}

func TestFirestoreStore_SessionLifecycle(t *testing.T) {
	s := newTestFirestoreStore(t)
	ctx := context.Background()
	userID := "user-session-" + t.Name()

	rawSessionID, err := s.Create(ctx, userID, time.Hour)
	if err != nil {
		t.Fatalf("Create: %v", err)
	}

	session, err := s.Lookup(ctx, rawSessionID)
	if err != nil {
		t.Fatalf("Lookup: %v", err)
	}
	if session.UserID != userID {
		t.Fatalf("session.UserID = %q, want %q", session.UserID, userID)
	}

	if err := s.Delete(ctx, rawSessionID); err != nil {
		t.Fatalf("Delete: %v", err)
	}
	if _, err := s.Lookup(ctx, rawSessionID); err != ErrSessionNotFound {
		t.Fatalf("Lookup after delete: err = %v, want ErrSessionNotFound", err)
	}

	// Deleting an already-deleted (nonexistent) session is not an error.
	if err := s.Delete(ctx, rawSessionID); err != nil {
		t.Fatalf("Delete (already deleted): %v", err)
	}
}

func TestFirestoreStore_LookupExpiredSessionDeletesIt(t *testing.T) {
	s := newTestFirestoreStore(t)
	ctx := context.Background()
	userID := "user-expired-" + t.Name()

	rawSessionID, err := s.Create(ctx, userID, -time.Minute) // already expired
	if err != nil {
		t.Fatalf("Create: %v", err)
	}

	if _, err := s.Lookup(ctx, rawSessionID); err != ErrSessionNotFound {
		t.Fatalf("Lookup expired session: err = %v, want ErrSessionNotFound", err)
	}

	docRef := s.Client.Collection(sessionsCollection).Doc(hashSessionID(rawSessionID))
	if _, err := docRef.Get(ctx); status.Code(err) != codes.NotFound {
		t.Fatalf("expired session document was not deleted: err = %v", err)
	}
}

func TestFirestoreStore_DeleteExpiredForUser(t *testing.T) {
	s := newTestFirestoreStore(t)
	ctx := context.Background()
	userID := "user-cleanup-" + t.Name()

	expiredID, err := s.Create(ctx, userID, -time.Minute)
	if err != nil {
		t.Fatalf("Create (expired): %v", err)
	}
	activeID, err := s.Create(ctx, userID, time.Hour)
	if err != nil {
		t.Fatalf("Create (active): %v", err)
	}

	if err := s.DeleteExpiredForUser(ctx, userID); err != nil {
		t.Fatalf("DeleteExpiredForUser: %v", err)
	}

	if _, err := s.Lookup(ctx, activeID); err != nil {
		t.Fatalf("active session was affected: %v", err)
	}

	expiredDoc, err := s.Client.Collection(sessionsCollection).Doc(hashSessionID(expiredID)).Get(ctx)
	if status.Code(err) != codes.NotFound {
		t.Fatalf("expired session document still exists: snap = %v, err = %v", expiredDoc, err)
	}
}

func TestFirestoreStore_CreateGetUpdateDeleteGroup(t *testing.T) {
	s := newTestFirestoreStore(t)
	ctx := context.Background()
	userID := "user-groups-" + t.Name()

	created, err := s.CreateGroup(ctx, userID, "manga cafe")
	if err != nil {
		t.Fatalf("CreateGroup: %v", err)
	}
	if created.ID == "" || created.CreatedAt.IsZero() || created.UpdatedAt.IsZero() {
		t.Fatalf("created group not fully populated: %+v", created)
	}

	got, err := s.GetGroup(ctx, userID, created.ID)
	if err != nil {
		t.Fatalf("GetGroup: %v", err)
	}
	if got.Name != "manga cafe" {
		t.Fatalf("GetGroup name = %q, want %q", got.Name, "manga cafe")
	}

	updated, err := s.UpdateGroup(ctx, userID, created.ID, "purchased")
	if err != nil {
		t.Fatalf("UpdateGroup: %v", err)
	}
	if updated.Name != "purchased" {
		t.Fatalf("UpdateGroup name = %q, want %q", updated.Name, "purchased")
	}
	if !updated.CreatedAt.Equal(created.CreatedAt) {
		t.Fatalf("UpdateGroup changed CreatedAt: got %v, want %v", updated.CreatedAt, created.CreatedAt)
	}

	if err := s.DeleteGroup(ctx, userID, created.ID); err != nil {
		t.Fatalf("DeleteGroup: %v", err)
	}
	if _, err := s.GetGroup(ctx, userID, created.ID); err != ErrGroupNotFound {
		t.Fatalf("GetGroup after delete: err = %v, want ErrGroupNotFound", err)
	}

	// Deleting an already-deleted group is not an error, so a retried
	// DELETE also succeeds.
	if err := s.DeleteGroup(ctx, userID, created.ID); err != nil {
		t.Fatalf("DeleteGroup (already deleted): %v", err)
	}
}

func TestFirestoreStore_GetMissingGroup(t *testing.T) {
	s := newTestFirestoreStore(t)
	ctx := context.Background()

	_, err := s.GetGroup(ctx, "user-"+t.Name(), "no-such-group")
	if err != ErrGroupNotFound {
		t.Fatalf("GetGroup missing group: err = %v, want ErrGroupNotFound", err)
	}
}

func TestFirestoreStore_ListGroupsInCreationOrderAndScopedPerUser(t *testing.T) {
	s := newTestFirestoreStore(t)
	ctx := context.Background()
	userID := "user-list-" + t.Name()
	otherUserID := "user-list-other-" + t.Name()

	first, err := s.CreateGroup(ctx, userID, "first")
	if err != nil {
		t.Fatalf("CreateGroup (first): %v", err)
	}
	second, err := s.CreateGroup(ctx, userID, "second")
	if err != nil {
		t.Fatalf("CreateGroup (second): %v", err)
	}
	if _, err := s.CreateGroup(ctx, otherUserID, "someone else's group"); err != nil {
		t.Fatalf("CreateGroup (other user): %v", err)
	}

	groups, err := s.ListGroups(ctx, userID)
	if err != nil {
		t.Fatalf("ListGroups: %v", err)
	}
	if len(groups) != 2 || groups[0].ID != first.ID || groups[1].ID != second.ID {
		t.Fatalf("ListGroups = %+v, want [%+v, %+v] in creation order", groups, first, second)
	}
}

func TestFirestoreStore_CreateGetUpdateDeleteItem(t *testing.T) {
	s := newTestFirestoreStore(t)
	ctx := context.Background()
	userID := "user-items-" + t.Name()

	group, err := s.CreateGroup(ctx, userID, "manga cafe")
	if err != nil {
		t.Fatalf("CreateGroup: %v", err)
	}

	created, err := s.CreateItem(ctx, userID, group.ID, "ONE PIECE", 100)
	if err != nil {
		t.Fatalf("CreateItem: %v", err)
	}
	if created.ID == "" || created.CreatedAt.IsZero() || created.UpdatedAt.IsZero() {
		t.Fatalf("created item not fully populated: %+v", created)
	}

	got, err := s.GetItem(ctx, userID, group.ID, created.ID)
	if err != nil {
		t.Fatalf("GetItem: %v", err)
	}
	if got.Title != "ONE PIECE" || got.CompletedVolume != 100 {
		t.Fatalf("GetItem = %+v, want title=ONE PIECE, completedVolume=100", got)
	}

	updated, err := s.UpdateItem(ctx, userID, group.ID, created.ID, "ONE PIECE", 105)
	if err != nil {
		t.Fatalf("UpdateItem: %v", err)
	}
	if updated.CompletedVolume != 105 {
		t.Fatalf("UpdateItem completedVolume = %d, want 105", updated.CompletedVolume)
	}
	if !updated.CreatedAt.Equal(created.CreatedAt) {
		t.Fatalf("UpdateItem changed CreatedAt: got %v, want %v", updated.CreatedAt, created.CreatedAt)
	}

	if err := s.DeleteItem(ctx, userID, group.ID, created.ID); err != nil {
		t.Fatalf("DeleteItem: %v", err)
	}
	if _, err := s.GetItem(ctx, userID, group.ID, created.ID); err != ErrItemNotFound {
		t.Fatalf("GetItem after delete: err = %v, want ErrItemNotFound", err)
	}

	// Deleting an already-deleted item is not an error, so a retried DELETE
	// also succeeds.
	if err := s.DeleteItem(ctx, userID, group.ID, created.ID); err != nil {
		t.Fatalf("DeleteItem (already deleted): %v", err)
	}
}

func TestFirestoreStore_GetMissingItem(t *testing.T) {
	s := newTestFirestoreStore(t)
	ctx := context.Background()
	userID := "user-" + t.Name()

	group, err := s.CreateGroup(ctx, userID, "manga cafe")
	if err != nil {
		t.Fatalf("CreateGroup: %v", err)
	}

	_, err = s.GetItem(ctx, userID, group.ID, "no-such-item")
	if err != ErrItemNotFound {
		t.Fatalf("GetItem missing item: err = %v, want ErrItemNotFound", err)
	}
}

func TestFirestoreStore_ListItemsInCreationOrderAndScopedPerGroup(t *testing.T) {
	s := newTestFirestoreStore(t)
	ctx := context.Background()
	userID := "user-list-items-" + t.Name()

	group, err := s.CreateGroup(ctx, userID, "manga cafe")
	if err != nil {
		t.Fatalf("CreateGroup: %v", err)
	}
	otherGroup, err := s.CreateGroup(ctx, userID, "another shelf")
	if err != nil {
		t.Fatalf("CreateGroup (other): %v", err)
	}

	first, err := s.CreateItem(ctx, userID, group.ID, "first", 1)
	if err != nil {
		t.Fatalf("CreateItem (first): %v", err)
	}
	second, err := s.CreateItem(ctx, userID, group.ID, "second", 2)
	if err != nil {
		t.Fatalf("CreateItem (second): %v", err)
	}
	if _, err := s.CreateItem(ctx, userID, otherGroup.ID, "someone else's item", 3); err != nil {
		t.Fatalf("CreateItem (other group): %v", err)
	}

	items, err := s.ListItems(ctx, userID, group.ID)
	if err != nil {
		t.Fatalf("ListItems: %v", err)
	}
	if len(items) != 2 || items[0].ID != first.ID || items[1].ID != second.ID {
		t.Fatalf("ListItems = %+v, want [%+v, %+v] in creation order", items, first, second)
	}
}

func TestFirestoreStore_DeleteGroupDeletesItems(t *testing.T) {
	s := newTestFirestoreStore(t)
	ctx := context.Background()
	userID := "user-cascade-" + t.Name()

	group, err := s.CreateGroup(ctx, userID, "manga cafe")
	if err != nil {
		t.Fatalf("CreateGroup: %v", err)
	}

	itemRef := s.groupsCollection(userID).Doc(group.ID).Collection(itemsCollection).Doc("item-1")
	if _, err := itemRef.Set(ctx, map[string]any{"title": "One Piece", "completedVolume": 100}); err != nil {
		t.Fatalf("seed item: %v", err)
	}

	if err := s.DeleteGroup(ctx, userID, group.ID); err != nil {
		t.Fatalf("DeleteGroup: %v", err)
	}

	if _, err := itemRef.Get(ctx); status.Code(err) != codes.NotFound {
		t.Fatalf("item still exists after group delete: err = %v", err)
	}
}
