package store

import (
	"context"
	"sync"
	"time"
)

// MemoryStore is an in-memory UserStore, SessionStore, and GroupStore for
// handler tests that don't need to exercise the real Firestore-backed
// implementation.
type MemoryStore struct {
	mu       sync.Mutex
	users    map[string]*User
	sessions map[string]*Session // keyed by raw session ID
	groups   []*memoryGroup      // preserves creation order
}

// memoryGroup pairs a Group with its owning userID, since Group itself
// (like the Firestore subcollection document) doesn't carry it.
type memoryGroup struct {
	userID string
	group  Group
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

func (s *MemoryStore) ListGroups(ctx context.Context, userID string) ([]*Group, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	groups := []*Group{}
	for _, g := range s.groups {
		if g.userID == userID {
			copied := g.group
			groups = append(groups, &copied)
		}
	}
	return groups, nil
}

func (s *MemoryStore) CreateGroup(ctx context.Context, userID, name string) (*Group, error) {
	id, err := newID()
	if err != nil {
		return nil, err
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	now := time.Now().UTC()
	group := Group{ID: id, Name: name, CreatedAt: now, UpdatedAt: now}
	s.groups = append(s.groups, &memoryGroup{userID: userID, group: group})
	copied := group
	return &copied, nil
}

func (s *MemoryStore) GetGroup(ctx context.Context, userID, groupID string) (*Group, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	g := s.findGroup(userID, groupID)
	if g == nil {
		return nil, ErrGroupNotFound
	}
	copied := g.group
	return &copied, nil
}

func (s *MemoryStore) UpdateGroup(ctx context.Context, userID, groupID, name string) (*Group, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	g := s.findGroup(userID, groupID)
	if g == nil {
		return nil, ErrGroupNotFound
	}
	g.group.Name = name
	g.group.UpdatedAt = time.Now().UTC()
	copied := g.group
	return &copied, nil
}

func (s *MemoryStore) DeleteGroup(ctx context.Context, userID, groupID string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	for i, g := range s.groups {
		if g.userID == userID && g.group.ID == groupID {
			s.groups = append(s.groups[:i], s.groups[i+1:]...)
			break
		}
	}
	return nil
}

// findGroup returns userID's group record for groupID, or nil. Callers must
// hold s.mu.
func (s *MemoryStore) findGroup(userID, groupID string) *memoryGroup {
	for _, g := range s.groups {
		if g.userID == userID && g.group.ID == groupID {
			return g
		}
	}
	return nil
}
