-- 001_init.sql
-- EduOS Identity System: roles + users (Level 9 of the spec, simplified for Phase 1)

-- Needed for gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS roles (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(50) UNIQUE NOT NULL,      -- 'admin' | 'teacher' | 'student'
    permissions JSONB NOT NULL DEFAULT '[]'::jsonb -- e.g. ["classroom:read","classroom:write","cbt:grade"]
);

CREATE TABLE IF NOT EXISTS users (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name     VARCHAR(150) NOT NULL,
    email         VARCHAR(150) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role_id       INTEGER NOT NULL REFERENCES roles(id),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- Seed default roles with example permission sets.
-- These map to the "Identity -> Permission -> Application" flow in the spec.
INSERT INTO roles (name, permissions) VALUES
    ('admin',   '["*"]'),
    ('teacher', '["classroom:read","classroom:write","cbt:read","cbt:grade","attendance:write"]'),
    ('student', '["classroom:read","cbt:submit","attendance:read"]')
ON CONFLICT (name) DO NOTHING;
