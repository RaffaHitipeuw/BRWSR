package main

import (
	"context"
	"log"
	"os"

	"github.com/eduos/services/auth/internal"
	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
	"github.com/gofiber/fiber/v2/middleware/logger"
	"github.com/joho/godotenv"
)

func main() {
	_ = godotenv.Load() // ignore error: fine if .env doesn't exist (e.g. in prod)

	port := getEnv("PORT", "8080")
	databaseURL := getEnv("DATABASE_URL", "postgres://eduos:eduos_dev_password@localhost:5432/eduos?sslmode=disable")
	accessSecret := getEnv("JWT_ACCESS_SECRET", "dev-access-secret-change-me")
	refreshSecret := getEnv("JWT_REFRESH_SECRET", "dev-refresh-secret-change-me")

	ctx := context.Background()
	pool, err := internal.NewDBPool(ctx, databaseURL)
	if err != nil {
		log.Fatalf("database connection failed: %v\n(did you run `docker compose up -d` in infra/docker first?)", err)
	}
	defer pool.Close()

	tm := internal.NewTokenManager(accessSecret, refreshSecret)
	authHandler := internal.NewAuthHandler(pool, tm)

	app := fiber.New(fiber.Config{
		AppName: "EduOS Auth Service",
	})

	app.Use(logger.New())
	app.Use(cors.New(cors.Config{
		AllowOrigins: "http://localhost:5173",
		AllowHeaders: "Origin, Content-Type, Accept, Authorization",
	}))

	app.Get("/health", func(c *fiber.Ctx) error {
		return c.JSON(fiber.Map{"status": "ok", "service": "eduos-auth"})
	})

	api := app.Group("/api/auth")
	api.Post("/register", authHandler.Register)
	api.Post("/login", authHandler.Login)
	api.Post("/refresh", authHandler.Refresh)
	api.Get("/me", internal.RequireAuth(tm), authHandler.Me)

	log.Printf("EduOS auth service listening on :%s", port)
	if err := app.Listen(":" + port); err != nil {
		log.Fatal(err)
	}
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
