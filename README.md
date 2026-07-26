# EduOS — Phase 2 Browser Shell

> Baca `docs/STATUS.md` dan `docs/roadmap.md` dulu kalau belum — ini Phase 2
> dari roadmap (browser shell dengan launcher, sidebar, notification, auto update).
> Phase 1 fokus ke monorepo, design system, identity service, login, database.

## What's New in Phase 2

### Tab Manager

- **Pin tabs** - keep important tabs open
- **Tab groups** - organize tabs with colors
- **Drag & drop** - reorder tabs easily
- **Memory limits** - auto-manage tab count
- **Context menu** - right-click for more options

### Sidebar Navigation

- **Collapsible** - hide to save space
- **Active state** - see where you are
- **Badges** - notification counts

### Notification System

- **Toast notifications** - animated, auto-dismiss
- **Notification center** - full history
- **Desktop notifications** - native OS alerts

### App Launcher

- **Ctrl+K** - quick app access
- **Search** - find apps fast
- **Keyboard navigation** - arrows + enter

### Auto Update

- **Background check** - notifies when update available
- **One-click install** - restart and apply

## 0. Yang perlu lu install dulu

| Tool                                                              | Versi minimal    | Cek dengan   |
| ----------------------------------------------------------------- | ---------------- | ------------ |
| [Node.js](https://nodejs.org)                                     | 18+              | `node -v`    |
| [Go](https://go.dev/dl/)                                          | 1.22+            | `go version` |
| [Docker Desktop](https://www.docker.com/products/docker-desktop/) | terbaru          | `docker -v`  |
| [Rust + Cargo](https://rustup.rs)                                 | terbaru (stable) | `cargo -V`   |

## 1. Nyalain database

```bash
cd infra/docker
docker compose up -d
```

Ini bakal narik image `postgres:16-alpine` dan otomatis run
`services/auth/migrations/001_init.sql` saat container pertama kali dibuat
(bikin tabel `roles` + `users`, seed 3 role: admin/teacher/student).

Cek udah nyala:

```bash
docker ps
# harus ada container "eduos-postgres" dengan status "healthy"
```

## 2. Nyalain auth/identity service (Go)

```bash
cd services/auth
cp .env.example .env
go mod tidy      # download dependency, generate go.sum (butuh internet)
go run main.go
```

Kalau berhasil, muncul log: `EduOS auth service listening on :8080`

## 3. Nyalain dashboard (React + Tailwind + Zustand)

Buka terminal baru:

```bash
npm install          # install semua workspace sekaligus (butuh internet)
npm run dev:dashboard
```

Buka `http://localhost:5173` di browser. Lu akan liat halaman Login pakai
komponen dari `packages/ui` (Button, Card, Input). Daftar/login, lalu lu akan
diarahkan ke Home yang nampilin avatar + role badge + menu yang otomatis
muncul/hilang sesuai permission role lu.

## 4. Nyalain browser shell (Tauri)

Pastikan dashboard di langkah 3 masih jalan di `:5173`, lalu di terminal baru:

```bash
cd apps/browser
npm install          # includes @tauri-apps/plugin-updater
npm run tauri dev
```

### Browser Shell Features

| Fitur            | Cara Pakai                     |
| ---------------- | ------------------------------ |
| New Tab          | Ctrl+T                         |
| Close Tab        | Ctrl+W                         |
| Navigate Back    | Alt+←                          |
| Navigate Forward | Alt+→                          |
| Refresh          | Ctrl+R atau F5                 |
| App Launcher     | Ctrl+K                         |
| Pin Tab          | Right-click → Pin Tab          |
| Tab Group        | Right-click → Add to New Group |

## 5. (Opsional) Setup Auto Update

Untuk production, butuh signing key:

```bash
cd apps/browser/src-tauri
npm run tauri signer generate
```

Masukkan public key ke `tauri.conf.json`:

```json
{
  "plugins": {
    "updater": {
      "pubkey": "YOUR_PUBLIC_KEY",
      "endpoints": ["https://releases.eduos.app/{{target}}/{{arch}}/{{current_version}}"]
    }
  }
}
```

## Troubleshooting

- **`go mod tidy` gagal / timeout** → cek koneksi internet, Go perlu akses proxy.golang.org buat download module.
- **`npm install` error peer dependency** → coba `npm install --legacy-peer-deps`.
- **Auth service error "database connection failed"** → pastikan `docker compose up -d` di step 1 sudah jalan dan healthy.
- **`cargo tauri dev` isn't found** → pastikan udah `npm install` di dalam `apps/browser`.
- **Updater error "pubkey not set"** → perlu generate signing key di step 5.
- **Port 5173/8080/5432 udah dipakai** → matiin proses itu, atau ubah port di `vite.config.ts` / `.env` / `docker-compose.yml`.

## Lanjut ke Phase 3

Begitu Phase 2 ini lu konfirmasi jalan di laptop lu, kabarin — kita lanjut
bangun Teacher App (Dashboard, Presensi, Nilai) di Phase 3. Ikuti urutan
roadmap biar setiap phase udah kebukti jalan sebelum mulai phase berikutnya.
