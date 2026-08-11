# EduOS Browser

**A lightweight browser for constrained educational devices, built with WebView2 and designed as a research platform for studying knowledge work patterns.**

---

## Abstract

EduOS Browser explores the trade-off between memory efficiency and user experience in constrained educational environments. We implemented a single WebView architecture with lazy WebView creation to minimize baseline memory footprint. This paper documents our empirical measurements and the engineering decisions that emerged from observing user behavior patterns.

---

## Key Findings

### Memory Footprint

| State  | Memory (MB) | Description                                      |
| ------ | ----------- | ------------------------------------------------ |
| **T1** | ~120        | Baseline: WebView2 infrastructure initialized    |
| **T2** | ~357        | Active browsing: Application + WebView + Content |
| **T3** | _pending_   | WebView destroyed, application alive             |

> All measurements taken on Windows 11 with WebView2 runtime installed. Values represent process memory as observed via Task Manager.

### WebView2 Process Composition (T2)

```
WebView2 Manager (7 processes):     97 MB
WebView2 Google (content):          64 MB
WebView2 GPU Process:              69 MB
WebView2 Application:               23 MB
WebView2 Utility Network:           8 MB
WebView2 Utility Storage:          4 MB
Crashpad:                          2 MB
────────────────────────────────────────
Total:                            ~357 MB
```

### Observed Memory Difference

The measured memory difference between baseline (T1) and active browsing state (T2) was approximately **237 MB**.

---

## Architecture

### Single WebView with Virtual Tab Navigation

```
┌─────────────────────────────────────────────────────────────┐
│                    EduOS Browser Process                      │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────────────────┐    ┌────────────────────────────┐  │
│  │   Main Window       │    │   Browser Window          │  │
│  │   (React UI Shell)  │    │   (WebView2 Content)     │  │
│  │                     │    │                          │  │
│  │   Tab Bar          │    │   google.com            │  │
│  │   Navigation Bar   │    │                          │  │
│  │   Content Area     │    │   Single WebView        │  │
│  │                     │    │                          │  │
│  └──────────────────────┘    └────────────────────────────┘  │
│           │                          │                       │
│           └───────── Parent ─────────┘                       │
│                                                             │
│  Rust Backend (Tauri)                                       │
│  ├── WebView Lifecycle Manager                              │
│  ├── Memory Tracker (sysinfo)                              │
│  ├── Navigation Sequence Tracker                           │
│  └── Session Manager                                       │
└─────────────────────────────────────────────────────────────┘
```

### Key Design Decisions

1. **Tabs are navigation history pointers, not independent WebViews**
   - Tab switching = navigating to a history URL
   - State is NOT preserved on tab switch

2. **WebView created lazily on first navigation**
   - Application starts without WebView overhead
   - Reduces baseline memory footprint

3. **Destroy-on-idle mechanism (proposed)**
   - Release WebView after configurable idle timeout
   - Preserve navigation state for restoration
   - Trade-off: Memory reclamation vs. page state loss

---

## Research Infrastructure

### Observable vs. Latent Variables

We explicitly distinguish between what we **observe** and what we **infer**:

**Stored (Observable):**

```json
{
  "navigation_events": [
    {
      "timestamp": 1732932000000,
      "url": "https://github.com/user/repo",
      "domain": "github.com",
      "action": "navigate",
      "tab_id": "tab_1",
      "memory_rss_mb": 45.2
    }
  ],
  "memory_snapshots": [...]
}
```

**Derived (Not Stored):**

- "Context" labels (e.g., "Programming", "Research")
- User intent or purpose
- Task boundaries

### Research Questions

1. **RQ1:** How do users organize information during prolonged knowledge work?
2. **RQ2:** Can URL sequence patterns reveal latent cognitive units?
3. **RQ3:** Does memory pressure affect navigation behavior?
4. **RQ4:** Are temporal gaps meaningful boundary markers?
5. **RQ5:** Can domain clusters predict user tasks?

### Theoretical Grounding

| Theory                | Citation                      | Application                         |
| --------------------- | ----------------------------- | ----------------------------------- |
| Activity Theory       | Leontiev (1978)               | Activity/Action/Operation hierarchy |
| Situated Cognition    | Brown, Collins, Duguid (1989) | Knowledge is context-dependent      |
| Distributed Cognition | Hutchins (1995)               | Cognition spreads across tools      |
| Cognitive Load Theory | Sweller (1988)                | Working memory limits               |

> **Note:** "Context" in our work is inspired by but distinct from Activity Theory's "Activity". We observe URL sequences; Activity Theory focuses on goal-directed actions.

---

## Engineering Trade-offs

### Memory vs. User Experience

```
                  MEMORY
                    ↑
                    │
              WebView alive
                    │
                    │  +237 MB (measured)
                    │
                    ↓
              WebView destroyed
                    │
                    │
              navigation state
              preserved
                    │
                    ↓
              page state lost
```

**Proposed Contribution:**

> EduOS trades transient page state for substantial memory reclamation when a browsing session becomes inactive.

### Objective Function

We do not optimize for:

```
RAM → minimum
```

We optimize for:

```
Memory ↓  while  UX degradation remains acceptable
```

This requires empirical validation through user studies.

---

## Future Work

### Immediate

- [ ] Measure T3: Memory after WebView destroy, application alive
- [ ] Implement configurable idle timeout (current default: 5 minutes)
- [ ] Validate timeout value through user observation

### Medium-term

- [ ] User study: Acceptability of state loss on tab switch
- [ ] Measure restoration latency after WebView recreation
- [ ] Compare with multi-WebView architecture

### Long-term

- [ ] Alternative rendering engines (GeckoView, Servo)
- [ ] Context-aware resource eviction
- [ ] Memory-pressure adaptive modes

---

## Building and Running

### Prerequisites

- Windows 10/11
- Rust (latest stable)
- Node.js 18+
- WebView2 Runtime (usually pre-installed on Windows 10/11)

### Build

```bash
# Clone and navigate
cd apps/browser

# Build frontend
npm install
npm run build

# Build backend (this creates the .exe)
cd src-tauri
cargo build --release

# The executable will be at:
# src-tauri/target/release/eduos-browser.exe
```

### Development

```bash
# Run in development mode (frontend + backend hot reload)
npm run dev
```

### Running the T3 Memory Experiment

To measure T3 (memory after WebView destroy, app alive):

1. Start the browser
2. Open DevTools console (F12)
3. Run the memory experiment:

```javascript
// Full T1 -> T2 -> T3 measurement
await browser.runMemoryExperiment();
// Returns: { t1, t2, t3, difference, reclamation_ratio }

// Or just measure T3 after browsing
await browser.measureT3();
// Returns: { memory_mb, timestamp, note }
```

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    EduOS Browser Process                      │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────────────────┐    ┌────────────────────────────┐  │
│  │   Main Window       │    │   Browser Window          │  │
│  │   (React UI Shell)  │    │   (WebView2 Content)     │  │
│  │                     │    │                          │  │
│  │   Tab Bar          │    │   google.com            │  │
│  │   Navigation Bar   │    │                          │  │
│  │   Content Area     │    │   Single WebView        │  │
│  │                     │    │                          │  │
│  └──────────────────────┘    └────────────────────────────┘  │
│           │                          │                       │
│           └───────── Parent ─────────┘                       │
│                                                             │
│  Rust Backend (Tauri)                                       │
│  ├── WebView Lifecycle Manager (Lazy Creation)             │
│  ├── Memory Tracker (sysinfo - Real RSS)                   │
│  ├── Navigation Sequence Tracker (Raw Events)             │
│  ├── Tab Manager (Virtual Tabs)                            │
│  └── Session Manager (Research Data)                      │
└─────────────────────────────────────────────────────────────┘
```

---

## WebView State Machine

```
                    ┌──────────────┐
                    │ Uninitialized │
                    └──────┬───────┘
                           │ navigate
                           ▼
                    ┌──────────────┐
         ┌─────────│  Creating    │
         │         └──────┬───────┘
         │                │ WebView created
         │                ▼
         │         ┌──────────────┐
         │  restore│   Active     │◄─────────┐
         │         └──────┬───────┘          │
         │                │                  │ navigation
         │                ▼                  │ activity
         │         ┌──────────────┐          │
         │         │    Idle      │──────────┘
         │         └──────┬───────┘
         │                │ idle timeout exceeded
         │                ▼
         │         ┌──────────────┐
         └────────│  Destroyed   │
                   └──────────────┘
```

---

## Data Storage Model

### Storage Layer (Raw Observations)

We store ONLY raw observations:

```json
{
  "navigation_events": {
    "timestamp": 1732932000000,
    "url": "https://github.com/user/repo",
    "domain": "github.com",
    "action": "navigate",
    "tab_id": "tab_1",
    "duration_ms": null,
    "memory_rss_mb": 45.2,
    "memory_pressure": "low"
  },
  "memory_snapshots": {
    "timestamp": 1732932000000,
    "process_rss_mb": 45.2,
    "process_virt_mb": 1024.5,
    "total_ram_mb": 16384.0,
    "used_ram_mb": 8192.0,
    "available_ram_mb": 8192.0,
    "pressure_level": "low",
    "pressure_ratio": 0.5
  }
}
```

### Analysis Layer (Derived - NOT stored)

The following are DERIVED, not stored:

- "Context" labels (e.g., "Programming", "Research")
- Session boundaries
- Task classifications
- Cognitive load estimates

---

## Acknowledgments

Developed as a research platform for studying knowledge work patterns in constrained educational environments.

---

## Citation

```
EduOS Browser Research Platform
Version 0.1.0
Built with Tauri v2, React, and WebView2
```
