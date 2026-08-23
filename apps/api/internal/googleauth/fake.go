package googleauth

import "context"

// FakeVerifier is a test double that returns a fixed result regardless of
// the token it is given, so handler tests do not need a real Google ID
// Token or network access.
type FakeVerifier struct {
	Claims *Claims
	Err    error
}

func (v *FakeVerifier) Verify(ctx context.Context, idToken string) (*Claims, error) {
	if v.Err != nil {
		return nil, v.Err
	}
	return v.Claims, nil
}
