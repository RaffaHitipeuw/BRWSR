package internal

import "time"

// User mirrors the `users` table.
type User struct {
	ID           string    `json:"id"`
	FullName     string    `json:"full_name"`
	Email        string    `json:"email"`
	PasswordHash string    `json:"-"`
	RoleID       int       `json:"role_id"`
	RoleName     string    `json:"role"`
	Permissions  []string  `json:"permissions"`
	CreatedAt    time.Time `json:"created_at"`
}

// RegisterRequest is the payload for POST /api/auth/register
type RegisterRequest struct {
	FullName string `json:"full_name"`
	Email    string `json:"email"`
	Password string `json:"password"`
	Role     string `json:"role"` // "admin" | "teacher" | "student"
}

// LoginRequest is the payload for POST /api/auth/login
type LoginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

// AuthResponse is returned on successful register/login/refresh.
type AuthResponse struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
	User         User   `json:"user"`
}

// RefreshRequest is the payload for POST /api/auth/refresh
type RefreshRequest struct {
	RefreshToken string `json:"refresh_token"`
}
