# EduOS Browser Benchmark Suite

Research infrastructure for lifecycle engine empirical validation.

## Purpose

Answer: **"Does the lifecycle engine actually reduce memory compared to not having it?"**

This requires **control vs treatment** design, not just before/after measurements.

## Methodology

### Control vs Treatment

```
CONTROL                          TREATMENT
─────────────────────────────    ─────────────────────────────
Lifecycle manager: OFF           Lifecycle manager: ON
Same workload                    Same workload
Same environment                 Same environment
                                    ↓
                               Memory pressure triggers eviction
                                    ↓
                               Tab suspended/evicted
```

### Peak Definition

```
PEAK = max(group_memory_mb) during measurement window

WARMUP (excluded from measurement)
├── t=0s: Start workload
├── t=30s: End warmup
│
MEASUREMENT (where peak is measured)
├── t=30s: Start measurement
├── t=60s: Sample every 500ms
└── t=90s: End measurement
```

### Memory Metric

**sysinfo.memory()** returns **resident memory** (RSS-like) in bytes.

```
group_memory_mb = Σ memory_mb(process)
                   for process ∈ WebView2 process group
```

Note: For Windows-specific metrics (PrivateBytes, WorkingSet), consider using Windows API directly.

### Process Identity

Windows PID is **NOT** stable identity. A PID can be reused after process exits.

```
Stable identity = (pid, start_time)
```

Two processes are the SAME only if BOTH pid AND start_time match.

## Output Format

```json
{
  "run_id": "run-1234567890",
  "timestamp": 1234567890,

  "methodology": {
    "warmup_seconds": 30,
    "measurement_seconds": 60,
    "sampling_interval_ms": 500,
    "memory_metric": "RESIDENT_MEMORY_MB",
    "peak_definition": "max(group_memory_mb) during measurement window",
    "runs": 3
  },

  "environment": {
    "os": "windows",
    "ram_mb": 16384,
    "cpu_brand": "Intel Core i7-10700K",
    "build_type": "release",
    "webview2_version": null
  },

  "comparison": {
    "control": {
      "peak_memory_mb": 1284.2,
      "mean_memory_mb": 1156.3,
      "median_memory_mb": 1148.7,
      "std_dev_mb": 45.2
    },
    "treatment": {
      "peak_memory_mb": 892.7,
      "mean_memory_mb": 756.4,
      "median_memory_mb": 742.1,
      "std_dev_mb": 38.9,
      "eviction_metrics": { ... },
      "restore_metrics": { ... }
    },
    "absolute_reduction_mb": 391.5,
    "relative_reduction_percent": 30.5
  },

  "correctness": {
    "all_invariants_held": true,
    "evict_webview_destroyed": true,
    "restore_webview_created": true,
    "scroll_not_preserved": true,
    "form_not_preserved": true
  },

  "hysteresis": {
    "pressure_events": 20,
    "actions_performed": 4,
    "blocked_by_cooldown": 11,
    "cooldown_effectiveness": 0.55
  },

  "race_condition": {
    "sequences_executed": 100,
    "correct_final_states": 100,
    "success_rate": 1.0
  }
}
```

## Running Benchmarks

```bash
# Lightweight workload, 3 runs
cargo run --release --bin eduos-benchmark -- lightweight 3

# Mixed workload, 5 runs
cargo run --release --bin eduos-benchmark -- mixed 5

# Heavy workload, 3 runs
cargo run --release --bin eduos-benchmark -- heavy 3
```

## Workloads

| Name          | Tabs | Description                                 |
| ------------- | ---- | ------------------------------------------- |
| `lightweight` | 5    | Static pages (example.com, etc.)            |
| `mixed`       | 10   | Static + interactive (Google, GitHub, etc.) |
| `heavy`       | 10   | Video/JS-heavy (YouTube, Twitter, etc.)     |

## Metrics

### Memory Metrics

| Metric             | Description                             |
| ------------------ | --------------------------------------- |
| `peak_memory_mb`   | Maximum group memory during measurement |
| `mean_memory_mb`   | Arithmetic mean of samples              |
| `median_memory_mb` | 50th percentile                         |
| `std_dev_mb`       | Standard deviation                      |

### Lifecycle Metrics

| Metric              | Description              |
| ------------------- | ------------------------ |
| `attempts`          | Total operation attempts |
| `successes`         | Successful completions   |
| `failures`          | Failed completions       |
| `success_rate`      | successes / attempts     |
| `mean_latency_ms`   | Mean operation latency   |
| `median_latency_ms` | Median operation latency |

### Correctness Metrics

| Invariant                   | Expected                 |
| --------------------------- | ------------------------ |
| `evict_metadata_preserved`  | true                     |
| `evict_url_preserved`       | true                     |
| `evict_webview_destroyed`   | true                     |
| `restore_webview_created`   | true                     |
| `scroll_position_preserved` | false (known limitation) |
| `form_state_preserved`      | false (known limitation) |

## Claim Template

After benchmark, use this template:

> "Under [workload] workload on [hardware], EduOS's lifecycle engine reduced peak WebView2 process-group memory by [X]% ([Y] MB → [Z] MB), with median restore latency [W] ms. n=[runs]. Correctness invariants: [pass/fail]. Hysteresis effectiveness: [X]%. Race condition success rate: [X]%."

Example:

> "Under 10-tab mixed workload on 16GB RAM (Intel i7-10700K, Windows 11, release build), EduOS's lifecycle engine reduced peak WebView2 process-group memory by 30.5% (1284.2 MB → 892.7 MB), with median restore latency 412 ms. n=3. Correctness invariants: pass. Hysteresis effectiveness: 55%. Race condition success rate: 100%."

## NOT This

- "Our browser is memory efficient"
- "WebView2 RSS decreased by X%"
- "We use advanced memory management"
- Any benchmark without control

## Acknowledged Limitations

1. **sysinfo vs Windows API**: Using sysinfo for portability. For precise Windows metrics, extend with Windows API.
2. **Heuristic process classification**: Edge processes identified by name, not COM query.
3. **Environment specificity**: Results valid only for reported hardware/software.
4. **Sample size**: n=3 minimum recommended, n=5 for stability.
5. **Single machine**: Results may vary across hardware configurations.
