# Arsitektur (Phase 1)

```
                 ┌────────────────────┐
                 │   apps/browser      │  Tauri + WebView2 shell
                 │   (native window)   │  (kosong, belum ada Tab/Memory Manager)
                 └─────────┬───────────┘
                           │ loads
                 ┌─────────▼───────────┐
                 │  apps/dashboard      │  React + Tailwind + Zustand
                 │  (Login, Home/menu)  │  consumes packages/ui
                 └─────────┬───────────┘
                           │ HTTP (fetch)
                 ┌─────────▼───────────┐
                 │  services/auth       │  Go + Fiber
                 │  (register/login/me) │  JWT access + refresh
                 └─────────┬───────────┘
                           │ SQL
                 ┌─────────▼───────────┐
                 │  Postgres (Docker)   │  roles + users
                 └──────────────────────┘
```

`packages/ui` dipakai langsung dari source (`src/index.ts`) lewat alias di
`vite.config.ts` dan `tsconfig.json` — belum ada build step terpisah, karena
di Phase 1 cuma ada satu app yang makainya. Begitu ada app kedua (Phase 2),
baru worth it bikin proper build pipeline buat package ini.

Lihat `docs/roadmap.md` untuk fase berikutnya, dan `STATUS.md` untuk apa
yang sudah/belum ada.
