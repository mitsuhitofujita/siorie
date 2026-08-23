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
