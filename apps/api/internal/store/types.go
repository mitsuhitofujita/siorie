// Package store persists users and sessions in Firestore, per the data
// model in docs/discussions/20260823-purpose-and-initial-tech-stack/proposal.md:
//
//	users/{googleSub}
//	sessions/{sha256(sessionId)}
package store

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"fmt"
	"time"
)

// User is a local user identified by their Google account's stable "sub".
type User struct {
	Sub         string
	Email       string
	DisplayName string
	PictureURL  string
	CreatedAt   time.Time
	UpdatedAt   time.Time
}

// UserStore persists local users.
type UserStore interface {
	// Upsert creates the user if Sub is new, or refreshes Email, DisplayName,
	// and PictureURL (and UpdatedAt) if the user already exists. It returns
	// the resulting user.
	Upsert(ctx context.Context, sub, email, displayName, pictureURL string) (*User, error)

	// Get returns the user identified by sub, or ErrUserNotFound.
	Get(ctx context.Context, sub string) (*User, error)
}

// ErrUserNotFound is returned by UserStore.Get for an unknown sub.
var ErrUserNotFound = fmt.Errorf("store: user not found")

// Session is a server-side session belonging to a user.
type Session struct {
	UserID    string
	CreatedAt time.Time
	ExpiresAt time.Time
}

// SessionStore persists sessions. Callers identify a session by its raw
// (unhashed) ID, matching what is placed in the session cookie; stores hash
// it internally before touching durable storage so the raw ID never appears
// there.
type SessionStore interface {
	// Create generates a new session ID, stores a session for userID that
	// expires after ttl, and returns the raw session ID for the cookie.
	Create(ctx context.Context, userID string, ttl time.Duration) (rawSessionID string, err error)

	// Lookup returns the session for a raw session ID. It returns
	// ErrSessionNotFound if the session does not exist or has expired,
	// deleting it first in the expired case.
	Lookup(ctx context.Context, rawSessionID string) (*Session, error)

	// Delete removes the session for a raw session ID. Deleting a
	// nonexistent session is not an error.
	Delete(ctx context.Context, rawSessionID string) error

	// DeleteExpiredForUser removes userID's already-expired sessions.
	DeleteExpiredForUser(ctx context.Context, userID string) error
}

// ErrSessionNotFound is returned by SessionStore.Lookup for a missing or
// expired session.
var ErrSessionNotFound = fmt.Errorf("store: session not found")

// newRawSessionID generates a cryptographically random session ID for use as
// a cookie value.
func newRawSessionID() (string, error) {
	buf := make([]byte, 32)
	if _, err := rand.Read(buf); err != nil {
		return "", fmt.Errorf("store: generate session id: %w", err)
	}
	return base64.RawURLEncoding.EncodeToString(buf), nil
}
