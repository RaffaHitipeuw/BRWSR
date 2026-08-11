// EduOS Browser Benchmark Suite
//
// Research Infrastructure for Lifecycle Engine Empirical Validation
//
// This is NOT part of the production browser runtime.
// This is a research tool for empirical validation.
//
// OUTPUT FORMAT:
// {
//   "run_id": "run-1234567890",
//   "timestamp": 1234567890,
//   "methodology": {
//     "warmup_seconds": 30,
//     "measurement_seconds": 60,
//     "sampling_interval_ms": 500,
//     "memory_metric": "RESIDENT_MEMORY_MB",
//     "peak_definition": "max(group_memory_mb) during measurement window",
//     "runs": 3
//   },
//   "environment": {
//     "ram_mb": 16384,
//     "cpu_brand": "Intel Core i7-...",
//     "build_type": "release"
//   },
//   "comparison": {
//     "control": {
//       "peak_memory_mb": 1284.2
//     },
//     "treatment": {
//       "peak_memory_mb": 892.7
//     },
//     "absolute_reduction_mb": 391.5,
//     "relative_reduction_percent": 30.5
//   },
//   "correctness": { ... },
//   "hysteresis": { ... },
//   "race_condition": { ... }
// }
//
// CLAIM TEMPLATE (after benchmark):
// "Under [workload] workload on [hardware], lifecycle engine reduced
//  peak WebView2 process-group memory by [X]% ([Y] MB -> [Z] MB)."

pub mod collector;
pub mod runner;

pub use collector::{
    Action, CorrectnessInvariants, EnvironmentInfo, HysteresisTestResult,
    LifecycleMetrics, ProcessIdentity, ProcessKind, ProcessSnapshot, RaceConditionTestResult,
    WebView2Collector, WebView2Snapshot, get_environment_info,
};

pub use runner::{
    run_benchmark_cli, BenchmarkResult, BenchmarkRunner, ComparisonResult,
    Condition, ConditionResult, CorrectnessResult, Methodology, Workload,
};
