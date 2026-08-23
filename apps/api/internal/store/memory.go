package store

import (
	"context"
	"sync"
	"time"
)

// MemoryStore is an in-memory UserStore and SessionStore for handler tests
// that don't need to exercise the real Firestore-backed implementation.
type MemoryStore struct {
	mu       sync.Mutex
	users    map[string]*User
	sessions map[string]*Session // keyed by raw session ID
}

func NewMemoryStore() *MemoryStore {
	return &MemoryStore{
		users:    make(map[string]*User),
		sessions: make(map[string]*Session),
	}
}

func (s *MemoryStore) Upsert(ctx context.Context, sub, email, displayName, pictureURL string) (*User, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	now := time.Now().UTC()
	createdAt := now
	if existing, ok := s.users[sub]; ok {
		createdAt = existing.CreatedAt
	}

	user := &User{
		Sub:         sub,
		Email:       email,
		DisplayName: displayName,
		PictureURL:  pictureURL,
		CreatedAt:   createdAt,
		UpdatedAt:   now,
	}
	s.users[sub] = user
	return user, nil
}

func (s *MemoryStore) Get(ctx context.Context, sub string) (*User, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	user, ok := s.users[sub]
	if !ok {
		return nil, ErrUserNotFound
	}
	copied := *user
	return &copied, nil
}

func (s *MemoryStore) Create(ctx context.Context, userID string, ttl time.Duration) (string, error) {
	rawSessionID, err := newRawSessionID()
	if err != nil {
		return "", err
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	now := time.Now().UTC()
	s.sessions[rawSessionID] = &Session{
		UserID:    userID,
		CreatedAt: now,
		ExpiresAt: now.Add(ttl),
	}
	return rawSessionID, nil
}

func (s *MemoryStore) Lookup(ctx context.Context, rawSessionID string) (*Session, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	session, ok := s.sessions[rawSessionID]
	if !ok {
		return nil, ErrSessionNotFound
	}
	if time.Now().UTC().After(session.ExpiresAt) {
		delete(s.sessions, rawSessionID)
		return nil, ErrSessionNotFound
	}

	copied := *session
	return &copied, nil
}

func (s *MemoryStore) Delete(ctx context.Context, rawSessionID string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	delete(s.sessions, rawSessionID)
	return nil
}

func (s *MemoryStore) DeleteExpiredForUser(ctx context.Context, userID string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	now := time.Now().UTC()
	for id, session := range s.sessions {
		if session.UserID == userID && now.After(session.ExpiresAt) {
			delete(s.sessions, id)
		}
	}
	return nil
}
