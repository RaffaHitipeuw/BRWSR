package internal

import (
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/golang-jwt/jwt/v5"
)

type Claims struct {
	UserID      string   `json:"uid"`
	Role        string   `json:"role"`
	Permissions []string `json:"permissions"`
	jwt.RegisteredClaims
}

type TokenManager struct {
	AccessSecret  []byte
	RefreshSecret []byte
	AccessTTL     time.Duration
	RefreshTTL    time.Duration
}

func NewTokenManager(accessSecret, refreshSecret string) *TokenManager {
	return &TokenManager{
		AccessSecret:  []byte(accessSecret),
		RefreshSecret: []byte(refreshSecret),
		AccessTTL:     15 * time.Minute,
		RefreshTTL:    7 * 24 * time.Hour,
	}
}

func (tm *TokenManager) sign(secret []byte, ttl time.Duration, u User) (string, error) {
	claims := Claims{
		UserID:      u.ID,
		Role:        u.RoleName,
		Permissions: u.Permissions,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(ttl)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			Issuer:    "eduos-auth",
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString(secret)
}

func (tm *TokenManager) NewAccessToken(u User) (string, error) {
	return tm.sign(tm.AccessSecret, tm.AccessTTL, u)
}

func (tm *TokenManager) NewRefreshToken(u User) (string, error) {
	return tm.sign(tm.RefreshSecret, tm.RefreshTTL, u)
}

func (tm *TokenManager) Parse(secret []byte, tokenStr string) (*Claims, error) {
	claims := &Claims{}
	token, err := jwt.ParseWithClaims(tokenStr, claims, func(t *jwt.Token) (interface{}, error) {
		return secret, nil
	})
	if err != nil || !token.Valid {
		return nil, fiber.ErrUnauthorized
	}
	return claims, nil
}

// RequireAuth is Fiber middleware that validates the access token and
// stores the parsed Claims in c.Locals("claims") for downstream handlers.
// This is the "Login -> Identity -> Permission" chain from Level 9 of the spec.
func RequireAuth(tm *TokenManager) fiber.Handler {
	return func(c *fiber.Ctx) error {
		header := c.Get("Authorization")
		if !strings.HasPrefix(header, "Bearer ") {
			return fiber.NewError(fiber.StatusUnauthorized, "missing bearer token")
		}
		tokenStr := strings.TrimPrefix(header, "Bearer ")

		claims, err := tm.Parse(tm.AccessSecret, tokenStr)
		if err != nil {
			return fiber.NewError(fiber.StatusUnauthorized, "invalid or expired token")
		}
		c.Locals("claims", claims)
		return c.Next()
	}
}

// RequirePermission checks the caller's permission list (or "*" for admin)
// before letting the request through. Example: RequirePermission("cbt:grade")
func RequirePermission(permission string) fiber.Handler {
	return func(c *fiber.Ctx) error {
		claims, ok := c.Locals("claims").(*Claims)
		if !ok {
			return fiber.NewError(fiber.StatusUnauthorized, "unauthenticated")
		}
		for _, p := range claims.Permissions {
			if p == "*" || p == permission {
				return c.Next()
			}
		}
		return fiber.NewError(fiber.StatusForbidden, "missing permission: "+permission)
	}
}
