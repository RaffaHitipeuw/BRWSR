# Roadmap

Disalin dari rencana awal, biar tetap jadi acuan satu sumber kebenaran.

| Phase             | Fokus                                                                                  | Level target | Status          |
| ----------------- | -------------------------------------------------------------------------------------- | ------------ | --------------- |
| 1 (1-2 bulan)     | Monorepo, Design System, Identity Service, Login, Database                             | 2/10         | ✅ **COMPLETE** |
| 2 (2-3 bulan)     | Browser shell, Launcher, Sidebar, Notification, Auto Update                            | 4/10         | ✅ **COMPLETE** |
| 3 (2-4 bulan)     | Teacher App: Dashboard, Presensi, Nilai                                                | 6/10         | 📋 Pending      |
| 4 (3-5 bulan)     | Classroom: upload materi, tugas, diskusi                                               | 7/10         | 📋 Pending      |
| 5 (3-4 bulan)     | CBT: timer, anti-refresh, auto-save, hasil ujian                                       | 8/10         | 📋 Pending      |
| 6 (2-3 bulan)     | Student Portal: jadwal, nilai, pengumuman                                              | 9/10         | 📋 Pending      |
| 7 (berkelanjutan) | Optimasi browser, memory manager, offline sync, delta update, plugin system, analytics | 10/10        | 📋 Pending      |

Total realistis buat satu orang: **1-2 tahun**, sesuai estimasi di dokumen
awal. Jangan dikompresi jadi satu kali kerja — tiap phase butuh phase
sebelumnya beneran jalan dan ketest dulu.

---

## Phase 2 Details (COMPLETE)

### Features Implemented

#### Tab Manager

- ✅ Tab persistence (localStorage)
- ✅ Pin/unpin tabs
- ✅ Mute/unmute tabs
- ✅ Duplicate tabs
- ✅ Close other/close all tabs
- ✅ Drag & drop reorder
- ✅ Memory limits (auto-close oldest non-pinned)
- ✅ Tab groups (create/delete/rename)

#### Sidebar

- ✅ Collapsible sidebar
- ✅ Navigation items with icons
- ✅ Active state indication
- ✅ Badge support (notification count)
- ✅ Sections grouping

#### Notification System

- ✅ Zustand store with persistence
- ✅ Toast notifications (animated)
- ✅ Notification center (full panel)
- ✅ Mark as read / mark all read
- ✅ Desktop notifications (if permitted)
- ✅ Auto-dismiss with configurable duration

#### App Launcher

- ✅ Ctrl+K overlay
- ✅ Search/filter apps
- ✅ Keyboard navigation (arrows + enter)
- ✅ Permission-based filtering
- ✅ Shortcut hints
- ✅ Categories

#### Auto Update

- ✅ Tauri updater plugin
- ✅ Rust backend commands
- ✅ Frontend hook (useUpdater)
- ✅ Update available indicator
- ✅ Download progress tracking

### File Structure

```
apps/browser/src/
├── components/
│   ├── index.ts
│   ├── AddressBar.tsx
│   ├── AppLauncher.tsx      # NEW
│   ├── BrowserManager.ts
│   ├── NavigationBar.tsx
│   ├── Notifications.tsx     # NEW
│   ├── Sidebar.tsx           # NEW
│   └── TabBar.tsx
├── hooks/
│   ├── index.ts
│   └── useUpdater.ts         # NEW
├── stores/
│   ├── index.ts
│   ├── notifications.ts      # NEW
│   └── tabs.ts
├── App.tsx
├── main.tsx
└── index.css

apps/browser/src-tauri/
├── src/
│   └── main.rs               # UPDATED: updater plugin + commands
├── Cargo.toml                # UPDATED: added plugins
└── tauri.conf.json          # UPDATED: updater config
```

---

## Next Steps

### Phase 3: Teacher App

Prioritas:

1. Teacher Dashboard - overview stats
2. Attendance (Presensi) - check in/out students
3. Grades (Nilai) - input and manage grades

### Phase 4: Classroom

1. Materials upload (materi)
2. Assignments (tugas)
3. Discussion board (diskusi)

### Phase 5: CBT

1. Exam timer
2. Anti-refresh protection
3. Auto-save answers
4. Results and analytics
