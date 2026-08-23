// Package googleauth verifies Google ID Tokens presented by the SPA after a
// Google Identity Services sign-in.
package googleauth

import (
	"context"
	"fmt"

	"google.golang.org/api/idtoken"
)

// validIssuers are the two "iss" claim values Google ID Tokens may carry.
// See https://developers.google.com/identity/gsi/web/guides/verify-google-id-token.
var validIssuers = map[string]bool{
	"accounts.google.com":         true,
	"https://accounts.google.com": true,
}

// Claims is the subset of a verified Google ID Token used by this application.
type Claims struct {
	Sub        string
	Email      string
	Name       string
	PictureURL string
}

// Verifier verifies a Google ID Token and extracts its claims.
type Verifier interface {
	Verify(ctx context.Context, idToken string) (*Claims, error)
}

// GoogleVerifier verifies ID Tokens against Google's public keys using the
// official client library, which handles key fetching, caching, and refresh.
type GoogleVerifier struct {
	ClientID string
}

// Verify checks the token's signature, audience, expiry, and issuer, and
// returns the claims this application needs.
func (v *GoogleVerifier) Verify(ctx context.Context, idToken string) (*Claims, error) {
	payload, err := idtoken.Validate(ctx, idToken, v.ClientID)
	if err != nil {
		return nil, fmt.Errorf("googleauth: validate id token: %w", err)
	}

	// idtoken.Validate checks the signature, aud, and exp, but not iss.
	if !validIssuers[payload.Issuer] {
		return nil, fmt.Errorf("googleauth: unexpected issuer %q", payload.Issuer)
	}

	email, _ := payload.Claims["email"].(string)
	name, _ := payload.Claims["name"].(string)
	picture, _ := payload.Claims["picture"].(string)

	return &Claims{
		Sub:        payload.Subject,
		Email:      email,
		Name:       name,
		PictureURL: picture,
	}, nil
}
