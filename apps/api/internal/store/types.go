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

// Group is an item group belonging to a user, identified within
// users/{sub}/groups/{groupId}.
type Group struct {
	ID        string
	Name      string
	CreatedAt time.Time
	UpdatedAt time.Time
}

// GroupStore persists a user's item groups. Every method is scoped to a
// userID (the Google account's "sub"), matching the proposal's rule that
// handlers build Firestore paths from the authenticated context's user ID,
// never from a request parameter.
type GroupStore interface {
	// ListGroups returns userID's groups in a fixed creation-time order.
	ListGroups(ctx context.Context, userID string) ([]*Group, error)

	// CreateGroup makes a new group named name for userID and returns it.
	CreateGroup(ctx context.Context, userID, name string) (*Group, error)

	// GetGroup returns userID's group identified by groupID, or
	// ErrGroupNotFound.
	GetGroup(ctx context.Context, userID, groupID string) (*Group, error)

	// UpdateGroup renames userID's group identified by groupID and returns
	// it, or ErrGroupNotFound.
	UpdateGroup(ctx context.Context, userID, groupID, name string) (*Group, error)

	// DeleteGroup removes userID's group identified by groupID along with
	// all of its items. Deleting an already-deleted (or nonexistent) group
	// is not an error, so callers can safely retry.
	DeleteGroup(ctx context.Context, userID, groupID string) error
}

// ErrGroupNotFound is returned by GroupStore.Get and GroupStore.Update for a
// group that doesn't exist (or doesn't belong to userID).
var ErrGroupNotFound = fmt.Errorf("store: group not found")

// Item is an item belonging to a group, identified within
// users/{sub}/groups/{groupId}/items/{itemId}.
type Item struct {
	ID              string
	Title           string
	CompletedVolume int
	CreatedAt       time.Time
	UpdatedAt       time.Time
}

// ItemStore persists a group's items. Every method is scoped to a userID and
// groupID, matching GroupStore's scoping rule; callers are expected to have
// already confirmed groupID exists (and belongs to userID) via
// GroupStore.GetGroup before calling these.
type ItemStore interface {
	// ListItems returns groupID's items in a fixed creation-time order.
	ListItems(ctx context.Context, userID, groupID string) ([]*Item, error)

	// CreateItem makes a new item in groupID for userID and returns it.
	CreateItem(ctx context.Context, userID, groupID, title string, completedVolume int) (*Item, error)

	// GetItem returns groupID's item identified by itemID, or
	// ErrItemNotFound.
	GetItem(ctx context.Context, userID, groupID, itemID string) (*Item, error)

	// UpdateItem changes userID's item identified by itemID within groupID
	// and returns it, or ErrItemNotFound.
	UpdateItem(ctx context.Context, userID, groupID, itemID, title string, completedVolume int) (*Item, error)

	// DeleteItem removes userID's item identified by itemID within groupID.
	// Deleting an already-deleted (or nonexistent) item is not an error, so
	// callers can safely retry.
	DeleteItem(ctx context.Context, userID, groupID, itemID string) error
}

// ErrItemNotFound is returned by ItemStore.GetItem and ItemStore.UpdateItem
// for an item that doesn't exist (or doesn't belong to userID/groupID).
var ErrItemNotFound = fmt.Errorf("store: item not found")

// newID generates a random opaque ID for a group or item, in the same style
// as newRawSessionID but shorter, since these are stored in URLs and lack a
// session ID's confidentiality requirement.
func newID() (string, error) {
	buf := make([]byte, 16)
	if _, err := rand.Read(buf); err != nil {
		return "", fmt.Errorf("store: generate id: %w", err)
	}
	return base64.RawURLEncoding.EncodeToString(buf), nil
}
