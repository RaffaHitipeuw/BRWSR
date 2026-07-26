# Status — apa yang sudah jadi, apa yang belum

## Phase 1 ✅ (Level 2/10) - COMPLETE

| Bagian                                   | Lokasi                     | Keterangan                                                 |
| ---------------------------------------- | -------------------------- | ---------------------------------------------------------- |
| Monorepo + workspace config              | root                       | npm workspaces, ESLint, Prettier, Husky, Commitlint        |
| Database schema                          | `services/auth/migrations` | tabel `roles` + `users`, seed 3 role                       |
| Identity/Auth service (Go + Fiber)       | `services/auth`            | register, login, refresh, JWT, bcrypt, permission check    |
| Design system (React + Tailwind + TS)    | `packages/ui`              | Button, Card, Input, Badge, Avatar + token warna/tipografi |
| Dashboard app (React + Zustand + Router) | `apps/dashboard`           | halaman Login/Register + Home yang gate menu by permission |
| Browser shell (Tauri + WebView2)         | `apps/browser`             | window kosong yang me-load dashboard                       |
| Docker Compose Postgres                  | `infra/docker`             | satu perintah buat nyalain database lokal                  |

## Phase 2 ✅ (Level 4/10) - COMPLETE

| Bagian               | Lokasi                                          | Keterangan                                                          |
| -------------------- | ----------------------------------------------- | ------------------------------------------------------------------- |
| Tab Manager Enhanced | `apps/browser/src/stores/tabs.ts`               | tab persistence, pin/unpin, mute, duplicate, reorder, memory limits |
| Tab Groups           | `apps/browser/src/stores/tabs.ts`               | create/delete/rename groups, add tabs to groups                     |
| Tab Context Menu     | `apps/browser/src/components/TabBar.tsx`        | right-click menu dengan banyak opsi                                 |
| Tab Drag & Drop      | `apps/browser/src/components/TabBar.tsx`        | drag tabs to reorder                                                |
| Sidebar Navigation   | `apps/browser/src/components/Sidebar.tsx`       | collapsible sidebar, navigation items, active state                 |
| Notification System  | `apps/browser/src/stores/notifications.ts`      | Zustand store dengan persistence                                    |
| Toast Notifications  | `apps/browser/src/components/Notifications.tsx` | animated toast dengan auto-dismiss                                  |
| Notification Center  | `apps/browser/src/components/Notifications.tsx` | full notification panel dengan mark as read                         |
| App Launcher         | `apps/browser/src/components/AppLauncher.tsx`   | Ctrl+K overlay dengan keyboard navigation                           |
| Tauri Updater Plugin | `apps/browser/src-tauri/`                       | Rust backend untuk auto-update                                      |
| Updater Frontend     | `apps/browser/src/hooks/useUpdater.ts`          | React hook untuk update management                                  |

## ❌ Belum ada (Phase 3 ke atas di roadmap asli)

- Teacher App: Dashboard, Presensi, Nilai
- Classroom: upload materi, tugas, diskusi
- CBT: timer, anti-refresh, auto-save, hasil ujian
- Student Portal: jadwal, nilai, pengumuman
- Redis, MinIO, Meilisearch
- Kubernetes, CI/CD pipeline, monitoring (Grafana/Loki/Sentry)
- Offline sync, delta update, plugin system

## ⚠️ Yang perlu lu tau sebelum jalanin

### Build Requirements

- Node.js 18+
- Go 1.22+
- Rust (stable)
- Docker Desktop (untuk database)
- Tauri CLI (`npm install` di dalam `apps/browser`)

### Environment Variables

Untuk updater, perlu set `pubkey` di `apps/browser/src-tauri/tauri.conf.json`:

```json
{
  "plugins": {
    "updater": {
      "pubkey": "YOUR_PUBLIC_KEY_HERE",
      "endpoints": ["https://releases.eduos.app/{{target}}/{{arch}}/{{current_version}}"]
    }
  }
}
```

Generate keypair dengan:

```bash
npm run tauri signer generate
```

### Testing

```bash
# 1. Start database
cd infra/docker && docker compose up -d

# 2. Start auth service
cd services/auth && go run main.go

# 3. Start dashboard
npm run dev:dashboard

# 4. Start browser (di terminal baru)
cd apps/browser && npm run tauri dev
```
