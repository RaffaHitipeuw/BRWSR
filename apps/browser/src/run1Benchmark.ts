/**
 * RUN 1 Benchmark Runner
 *
 * Research question:
 *   "What is the memory overhead of the lifecycle manager when no eviction is required?"
 *
 * Design:
 *   control:    lifecycle engine OFF  (no lifecycle tracking)
 *   treatment:  lifecycle engine ON   (lifecycle tracking active, no eviction)
 *
 * Both conditions: eviction_attempts = 0, no lifecycle events fired.
 * The difference measures only the overhead of the tracking infrastructure.
 *
 * Protocol:
 *   1. Take RUN 0 snapshot (verify telemetry)
 *   2. Run control benchmark (lifecycle OFF)
 *   3. Run treatment benchmark (lifecycle ON)
 *   4. Compare distributions across N independent runs
 *
 * Metric: RSS (operational definition — not PrivateMemorySize64)
 * Source: Fresh GetProcessInfos() per sample (no PID caching)
 */

const RUN1_CONFIG = {
  // Benchmark parameters
  tabCount: 2,
  measurementSeconds: 15,
  samplingIntervalMs: 500, // 2 samples/sec

  // Pages to load (cycling)
  urls: ["https://www.example.com", "https://www.wikipedia.org"],

  // Number of independent runs per condition
  runsPerCondition: 3,

  // Warmup (discarded from analysis)
  warmupSeconds: 5,
};

const run1Results = {
  control: [], // { run_id, mean_mb, peak_mb, samples, eviction_completed, duration_ms }
  treatment: [], // { run_id, mean_mb, peak_mb, samples, eviction_completed, duration_ms }
};

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runCondition(condition) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`RUN 1 | ${condition.toUpperCase()} | Starting ${RUN1_CONFIG.runsPerCondition} runs`);
  console.log("=".repeat(60));

  for (let run = 1; run <= RUN1_CONFIG.runsPerCondition; run++) {
    console.log(`\n[${condition}] Run ${run}/${RUN1_CONFIG.runsPerCondition}...`);

    // Verify telemetry still connected (RUN 0 check)
    const snapshot = await browser.getWebview2Snapshot();
    if (!snapshot.environment_found || snapshot.process_count === 0) {
      console.error("  FATAL: Telemetry disconnected. Abort.");
      return;
    }
    if (snapshot.renderer_count === 0) {
      console.warn("  WARNING: renderer_count=0 (may be OK if content not loaded)");
    }
    console.log(
      `  Telemetry OK: ${snapshot.process_count} processes, renderer=${snapshot.renderer_count}`,
    );

    // Run the benchmark
    const start = Date.now();
    const result = await browser.runBenchmarkWorkload({
      tabCount: RUN1_CONFIG.tabCount,
      urls: RUN1_CONFIG.urls,
      measurementSeconds: RUN1_CONFIG.measurementSeconds,
      samplingIntervalMs: RUN1_CONFIG.samplingIntervalMs,
      condition,
    });
    const elapsed = Date.now() - start;

    // Discard warmup samples
    const warmupSamples = Math.ceil(
      (RUN1_CONFIG.warmupSeconds * 1000) / RUN1_CONFIG.samplingIntervalMs,
    );
    const analysisSamples = result.samples.slice(warmupSamples);

    const mean_mb =
      analysisSamples.length > 0
        ? analysisSamples.reduce((a, b) => a + b, 0) / analysisSamples.length
        : 0;
    const peak_mb = analysisSamples.length > 0 ? Math.max(...analysisSamples) : 0;

    const entry = {
      run_id: result.run_id,
      condition,
      run_index: run,
      tab_count: result.tab_count,
      mean_mb: parseFloat(mean_mb.toFixed(2)),
      peak_mb: parseFloat(peak_mb.toFixed(2)),
      sample_count: analysisSamples.length,
      eviction_completed: result.lifecycle_stats.evict_completed,
      eviction_requested: result.lifecycle_stats.evict_requested,
      duration_ms: elapsed,
    };

    if (condition === "control") {
      run1Results.control.push(entry);
    } else {
      run1Results.treatment.push(entry);
    }

    console.log(`  Result: mean=${mean_mb.toFixed(1)} MB, peak=${peak_mb.toFixed(1)} MB`);
    console.log(
      `  Eviction: requested=${result.lifecycle_stats.evict_requested}, completed=${result.lifecycle_stats.evict_completed}`,
    );
    console.log(`  Duration: ${(elapsed / 1000).toFixed(1)}s (reported: ${result.duration_ms}ms)`);

    // Pause between runs
    if (run < RUN1_CONFIG.runsPerCondition) {
      console.log("  Sleeping 3s between runs...");
      await sleep(3000);
    }
  }
}

function summarize(results, label) {
  if (results.length === 0) return { label, n: 0, mean: 0, peak: 0 };

  const means = results.map((r) => r.mean_mb);
  const peaks = results.map((r) => r.peak_mb);

  const meanOfMeans = means.reduce((a, b) => a + b, 0) / means.length;
  const meanOfPeaks = peaks.reduce((a, b) => a + b, 0) / peaks.length;

  return {
    label,
    n: results.length,
    mean_mb: parseFloat(meanOfMeans.toFixed(2)),
    peak_mb: parseFloat(meanOfPeaks.toFixed(2)),
    mean_range: `${Math.min(...means).toFixed(1)}–${Math.max(...means).toFixed(1)} MB`,
    runs: results,
  };
}

function run1() {
  return runCondition("control")
    .then(() => {
      console.log("\n--- PAUSE: 5s between conditions ---");
      return sleep(5000);
    })
    .then(() => {
      return runCondition("treatment");
    })
    .then(() => {
      // Final report
      console.log("\n" + "=".repeat(60));
      console.log("RUN 1 RESULTS SUMMARY");
      console.log("=".repeat(60));

      const ctrl = summarize(run1Results.control, "control (lifecycle OFF)");
      const treat = summarize(run1Results.treatment, "treatment (lifecycle ON)");

      console.log(`\n  Control (lifecycle OFF):`);
      console.log(`    n runs:     ${ctrl.n}`);
      console.log(`    mean RSS:   ${ctrl.mean_mb} MB  [${ctrl.mean_range}]`);
      console.log(`    mean peak:  ${ctrl.peak_mb} MB`);

      console.log(`\n  Treatment (lifecycle ON):`);
      console.log(`    n runs:     ${treat.n}`);
      console.log(`    mean RSS:   ${treat.mean_mb} MB  [${treat.mean_range}]`);
      console.log(`    mean peak:  ${treat.peak_mb} MB`);

      const diff = treat.mean_mb - ctrl.mean_mb;
      const diffStr = diff >= 0 ? `+${diff.toFixed(2)} MB` : `${diff.toFixed(2)} MB`;

      console.log(`\n  Observed difference (treatment - control): ${diffStr}`);
      console.log(
        `  Note: eviction_completed in ALL runs: ${run1Results.control.every((r) => r.eviction_completed === 0) && run1Results.treatment.every((r) => r.eviction_completed === 0) ? "0 (CORRECT — no eviction required)" : "NON-ZERO (check conditions)"}`,
      );

      console.log(`\n  Interpretation:`);
      if (Math.abs(diff) < 1.0) {
        console.log(`    Difference (${diffStr}) is within noise range.`);
        console.log(`    Observed difference: LIKELY NOT MEANINGFUL from a single experiment.`);
      } else if (diff > 0) {
        console.log(`    Treatment shows HIGHER memory (+${diff.toFixed(2)} MB).`);
        console.log(`    Observed difference: CONSISTENT WITH OVERHEAD from lifecycle tracking.`);
        console.log(`    But: NOT PROOF of causation.`);
      } else {
        console.log(`    Treatment shows LOWER memory (${diff.toFixed(2)} MB).`);
        console.log(`    Observed difference: NOT EXPLAINED by lifecycle overhead hypothesis.`);
        console.log(`    Possible: measurement noise, GC variance, page load differences.`);
      }

      console.log(`\n  Next: Run more independent replicates before drawing conclusions.`);
      console.log("=".repeat(60));

      return { control: ctrl, treatment: treat };
    });
}

// Export for console use
window.run1 = run1;
window.run1Results = run1Results;
window.browser = browser;

console.log("RUN 1 Benchmark Runner loaded.");
console.log("Run with: run1()");
console.log("Or trigger individual conditions: runCondition('control')");
