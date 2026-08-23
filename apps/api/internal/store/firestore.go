package store

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"time"

	"cloud.google.com/go/firestore"
	"google.golang.org/api/iterator"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

const (
	usersCollection    = "users"
	sessionsCollection = "sessions"
)

// FirestoreStore implements UserStore and SessionStore against a Firestore
// database (or the local emulator, selected automatically by the client
// library via the FIRESTORE_EMULATOR_HOST environment variable).
type FirestoreStore struct {
	Client *firestore.Client
}

type userDoc struct {
	Email       string    `firestore:"email"`
	DisplayName string    `firestore:"displayName"`
	PictureURL  string    `firestore:"pictureUrl"`
	CreatedAt   time.Time `firestore:"createdAt"`
	UpdatedAt   time.Time `firestore:"updatedAt"`
}

func (s *FirestoreStore) Upsert(ctx context.Context, sub, email, displayName, pictureURL string) (*User, error) {
	docRef := s.Client.Collection(usersCollection).Doc(sub)
	// Firestore stores timestamps at microsecond precision, so truncate here
	// to match what a later read of this same document will return.
	now := time.Now().UTC().Truncate(time.Microsecond)
	createdAt := now

	if snap, err := docRef.Get(ctx); err == nil {
		var existing userDoc
		if err := snap.DataTo(&existing); err != nil {
			return nil, fmt.Errorf("store: decode existing user %s: %w", sub, err)
		}
		createdAt = existing.CreatedAt
	} else if status.Code(err) != codes.NotFound {
		return nil, fmt.Errorf("store: get user %s: %w", sub, err)
	}

	doc := userDoc{
		Email:       email,
		DisplayName: displayName,
		PictureURL:  pictureURL,
		CreatedAt:   createdAt,
		UpdatedAt:   now,
	}
	if _, err := docRef.Set(ctx, doc); err != nil {
		return nil, fmt.Errorf("store: set user %s: %w", sub, err)
	}

	return &User{
		Sub:         sub,
		Email:       email,
		DisplayName: displayName,
		PictureURL:  pictureURL,
		CreatedAt:   createdAt,
		UpdatedAt:   now,
	}, nil
}

func (s *FirestoreStore) Get(ctx context.Context, sub string) (*User, error) {
	snap, err := s.Client.Collection(usersCollection).Doc(sub).Get(ctx)
	if status.Code(err) == codes.NotFound {
		return nil, ErrUserNotFound
	} else if err != nil {
		return nil, fmt.Errorf("store: get user %s: %w", sub, err)
	}

	var doc userDoc
	if err := snap.DataTo(&doc); err != nil {
		return nil, fmt.Errorf("store: decode user %s: %w", sub, err)
	}

	return &User{
		Sub:         sub,
		Email:       doc.Email,
		DisplayName: doc.DisplayName,
		PictureURL:  doc.PictureURL,
		CreatedAt:   doc.CreatedAt,
		UpdatedAt:   doc.UpdatedAt,
	}, nil
}

type sessionDoc struct {
	UserID    string    `firestore:"userId"`
	CreatedAt time.Time `firestore:"createdAt"`
	ExpiresAt time.Time `firestore:"expiresAt"`
}

func hashSessionID(rawSessionID string) string {
	sum := sha256.Sum256([]byte(rawSessionID))
	return hex.EncodeToString(sum[:])
}

func (s *FirestoreStore) Create(ctx context.Context, userID string, ttl time.Duration) (string, error) {
	rawSessionID, err := newRawSessionID()
	if err != nil {
		return "", err
	}

	now := time.Now().UTC().Truncate(time.Microsecond)
	doc := sessionDoc{
		UserID:    userID,
		CreatedAt: now,
		ExpiresAt: now.Add(ttl),
	}
	docRef := s.Client.Collection(sessionsCollection).Doc(hashSessionID(rawSessionID))
	if _, err := docRef.Set(ctx, doc); err != nil {
		return "", fmt.Errorf("store: create session: %w", err)
	}

	return rawSessionID, nil
}

func (s *FirestoreStore) Lookup(ctx context.Context, rawSessionID string) (*Session, error) {
	docRef := s.Client.Collection(sessionsCollection).Doc(hashSessionID(rawSessionID))
	snap, err := docRef.Get(ctx)
	if status.Code(err) == codes.NotFound {
		return nil, ErrSessionNotFound
	} else if err != nil {
		return nil, fmt.Errorf("store: get session: %w", err)
	}

	var doc sessionDoc
	if err := snap.DataTo(&doc); err != nil {
		return nil, fmt.Errorf("store: decode session: %w", err)
	}

	if time.Now().UTC().After(doc.ExpiresAt) {
		if _, err := docRef.Delete(ctx); err != nil {
			return nil, fmt.Errorf("store: delete expired session: %w", err)
		}
		return nil, ErrSessionNotFound
	}

	return &Session{UserID: doc.UserID, CreatedAt: doc.CreatedAt, ExpiresAt: doc.ExpiresAt}, nil
}

func (s *FirestoreStore) Delete(ctx context.Context, rawSessionID string) error {
	docRef := s.Client.Collection(sessionsCollection).Doc(hashSessionID(rawSessionID))
	if _, err := docRef.Delete(ctx); err != nil {
		return fmt.Errorf("store: delete session: %w", err)
	}
	return nil
}

// DeleteExpiredForUser removes userID's expired sessions. It filters by a
// single equality field (userId), which Firestore indexes automatically, so
// no composite index is needed; expiry is then checked client-side. Session
// counts per user are expected to stay small (one per logged-in device).
func (s *FirestoreStore) DeleteExpiredForUser(ctx context.Context, userID string) error {
	now := time.Now().UTC()
	iter := s.Client.Collection(sessionsCollection).Where("userId", "==", userID).Documents(ctx)
	defer iter.Stop()

	for {
		snap, err := iter.Next()
		if errors.Is(err, iterator.Done) {
			break
		}
		if err != nil {
			return fmt.Errorf("store: list sessions for user %s: %w", userID, err)
		}

		var doc sessionDoc
		if err := snap.DataTo(&doc); err != nil {
			return fmt.Errorf("store: decode session: %w", err)
		}
		if now.After(doc.ExpiresAt) {
			if _, err := snap.Ref.Delete(ctx); err != nil {
				return fmt.Errorf("store: delete expired session: %w", err)
			}
		}
	}

	return nil
}
