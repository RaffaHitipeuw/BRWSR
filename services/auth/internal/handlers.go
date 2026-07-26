package internal

import (
	"context"
	"encoding/json"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"
)

type AuthHandler struct {
	DB    *pgxpool.Pool
	Token *TokenManager
}

func NewAuthHandler(db *pgxpool.Pool, tm *TokenManager) *AuthHandler {
	return &AuthHandler{DB: db, Token: tm}
}

// findUserByEmail loads a user joined with its role + permissions.
func (h *AuthHandler) findUserByEmail(ctx context.Context, email string) (User, error) {
	var u User
	var permsRaw []byte
	row := h.DB.QueryRow(ctx, `
		SELECT u.id, u.full_name, u.email, u.password_hash, u.role_id, r.name, r.permissions, u.created_at
		FROM users u JOIN roles r ON r.id = u.role_id
		WHERE u.email = $1`, email)
	err := row.Scan(&u.ID, &u.FullName, &u.Email, &u.PasswordHash, &u.RoleID, &u.RoleName, &permsRaw, &u.CreatedAt)
	if err != nil {
		return u, err
	}
	_ = json.Unmarshal(permsRaw, &u.Permissions)
	return u, nil
}

// Register creates a new user under an existing role (admin/teacher/student).
func (h *AuthHandler) Register(c *fiber.Ctx) error {
	var req RegisterRequest
	if err := c.BodyParser(&req); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid request body")
	}
	if req.FullName == "" || req.Email == "" || req.Password == "" || req.Role == "" {
		return fiber.NewError(fiber.StatusBadRequest, "full_name, email, password, role are required")
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, "could not hash password")
	}

	ctx := c.Context()
	var roleID int
	err = h.DB.QueryRow(ctx, `SELECT id FROM roles WHERE name = $1`, req.Role).Scan(&roleID)
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "unknown role: "+req.Role)
	}

	var newID string
	err = h.DB.QueryRow(ctx, `
		INSERT INTO users (full_name, email, password_hash, role_id)
		VALUES ($1, $2, $3, $4) RETURNING id`,
		req.FullName, req.Email, string(hash), roleID,
	).Scan(&newID)
	if err != nil {
		return fiber.NewError(fiber.StatusConflict, "email already registered")
	}

	user, err := h.findUserByEmail(ctx, req.Email)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, "user created but could not be loaded")
	}

	access, _ := h.Token.NewAccessToken(user)
	refresh, _ := h.Token.NewRefreshToken(user)

	return c.Status(fiber.StatusCreated).JSON(AuthResponse{
		AccessToken:  access,
		RefreshToken: refresh,
		User:         user,
	})
}

// Login verifies credentials and issues a fresh token pair.
func (h *AuthHandler) Login(c *fiber.Ctx) error {
	var req LoginRequest
	if err := c.BodyParser(&req); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid request body")
	}

	ctx := c.Context()
	user, err := h.findUserByEmail(ctx, req.Email)
	if err != nil {
		if err == pgx.ErrNoRows {
			return fiber.NewError(fiber.StatusUnauthorized, "invalid email or password")
		}
		return fiber.NewError(fiber.StatusInternalServerError, "lookup failed")
	}

	if bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(req.Password)) != nil {
		return fiber.NewError(fiber.StatusUnauthorized, "invalid email or password")
	}

	access, _ := h.Token.NewAccessToken(user)
	refresh, _ := h.Token.NewRefreshToken(user)

	return c.JSON(AuthResponse{
		AccessToken:  access,
		RefreshToken: refresh,
		User:         user,
	})
}

// Refresh exchanges a valid refresh token for a new access token.
func (h *AuthHandler) Refresh(c *fiber.Ctx) error {
	var req RefreshRequest
	if err := c.BodyParser(&req); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid request body")
	}

	claims, err := h.Token.Parse(h.Token.RefreshSecret, req.RefreshToken)
	if err != nil {
		return fiber.NewError(fiber.StatusUnauthorized, "invalid or expired refresh token")
	}

	user, err := h.userByID(c.Context(), claims.UserID)
	if err != nil {
		return fiber.NewError(fiber.StatusUnauthorized, "user no longer exists")
	}

	access, _ := h.Token.NewAccessToken(user)
	return c.JSON(fiber.Map{"access_token": access})
}

// Me returns the identity of the currently authenticated user.
// This demonstrates "Login -> Identity -> Permission -> Application" end to end.
func (h *AuthHandler) Me(c *fiber.Ctx) error {
	claims := c.Locals("claims").(*Claims)
	user, err := h.userByID(c.Context(), claims.UserID)
	if err != nil {
		return fiber.NewError(fiber.StatusNotFound, "user not found")
	}
	return c.JSON(user)
}

func (h *AuthHandler) userByID(ctx context.Context, id string) (User, error) {
	var u User
	var permsRaw []byte
	row := h.DB.QueryRow(ctx, `
		SELECT u.id, u.full_name, u.email, u.password_hash, u.role_id, r.name, r.permissions, u.created_at
		FROM users u JOIN roles r ON r.id = u.role_id
		WHERE u.id = $1`, id)
	err := row.Scan(&u.ID, &u.FullName, &u.Email, &u.PasswordHash, &u.RoleID, &u.RoleName, &permsRaw, &u.CreatedAt)
	if err != nil {
		return u, err
	}
	_ = json.Unmarshal(permsRaw, &u.Permissions)
	return u, nil
}
