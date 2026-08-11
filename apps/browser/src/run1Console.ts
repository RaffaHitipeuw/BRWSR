// RUN 1 Console Runner
// Paste this ENTIRE BLOCK into the browser's DevTools console (F12)
// while the app is running, and press Enter.
//
// Make sure:
// - App window is open and focused
// - WebView has loaded (navigate to any page first)
// - No other heavy processes running

const CONFIG = {
  tabCount: 2,
  urls: ["https://www.example.com", "https://www.wikipedia.org"],
  measurementSeconds: 15,
  samplingIntervalMs: 500,
  warmupDiscardSeconds: 5,
  runsPerCondition: 3,
};

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function runSingle(condition) {
  const start = performance.now();
  console.log(`[${condition.toUpperCase()}] Starting...`);

  const result = await window.__TAURI__.core.invoke("run_benchmark_workload", {
    tab_count: CONFIG.tabCount,
    urls: CONFIG.urls,
    measurement_seconds: CONFIG.measurementSeconds,
    sampling_interval_ms: CONFIG.samplingIntervalMs,
    condition: condition,
  });

  const elapsed = ((performance.now() - start) / 1000).toFixed(1);

  // Discard warmup
  const warmupSamples = Math.ceil((CONFIG.warmupDiscardSeconds * 1000) / CONFIG.samplingIntervalMs);
  const analysis = result.samples.slice(warmupSamples);
  const mean = analysis.length ? analysis.reduce((a, b) => a + b, 0) / analysis.length : 0;
  const peak = analysis.length ? Math.max(...analysis) : 0;

  const entry = {
    run_id: result.run_id,
    condition,
    mean_mb: +mean.toFixed(2),
    peak_mb: +peak.toFixed(2),
    eviction_completed: result.lifecycle_stats.evict_completed,
    eviction_requested: result.lifecycle_stats.evict_requested,
    sample_count: analysis.length,
    elapsed_s: +elapsed,
  };

  console.log(
    `[${condition.toUpperCase()}] mean=${mean.toFixed(1)}MB peak=${peak.toFixed(1)}MB ` +
      `evict_completed=${result.lifecycle_stats.evict_completed} (${elapsed}s)`,
  );

  return entry;
}

async function runRUN1() {
  console.log("=".repeat(60));
  console.log("RUN 1 — Lifecycle Overhead Benchmark");
  console.log("=".repeat(60));
  console.log("Config:", JSON.stringify(CONFIG, null, 2));
  console.log("");

  const all = [];

  // Control
  console.log("\nCONTROL (lifecycle OFF)");
  console.log("-".repeat(40));
  for (let i = 0; i < CONFIG.runsPerCondition; i++) {
    const r = await runSingle("control");
    all.push(r);
    if (i < CONFIG.runsPerCondition - 1) await sleep(2000);
  }

  // Pause
  console.log("\n--- 5s pause between conditions ---");
  await sleep(5000);

  // Treatment
  console.log("\nTREATMENT (lifecycle ON)");
  console.log("-".repeat(40));
  for (let i = 0; i < CONFIG.runsPerCondition; i++) {
    const r = await runSingle("treatment");
    all.push(r);
    if (i < CONFIG.runsPerCondition - 1) await sleep(2000);
  }

  // Summary
  console.log("\n" + "=".repeat(60));
  console.log("RESULTS");
  console.log("=".repeat(60));

  const control = all.filter((r) => r.condition === "control");
  const treatment = all.filter((r) => r.condition === "treatment");

  console.log("\nCONTROL (lifecycle OFF)");
  control.forEach((r, i) => {
    console.log(
      `  run ${i + 1}: mean=${r.mean_mb} MB, peak=${r.peak_mb} MB, evict_completed=${r.eviction_completed}`,
    );
  });

  console.log("\nTREATMENT (lifecycle ON)");
  treatment.forEach((r, i) => {
    console.log(
      `  run ${i + 1}: mean=${r.mean_mb} MB, peak=${r.peak_mb} MB, evict_completed=${r.eviction_completed}`,
    );
  });

  console.log("\nEVICTION COMPLETED");
  console.log(`  control:    ${control.map((r) => r.eviction_completed).join(", ")}`);
  console.log(`  treatment:  ${treatment.map((r) => r.eviction_completed).join(", ")}`);

  const ctrlMeans = control.map((r) => r.mean_mb);
  const treatMeans = treatment.map((r) => r.mean_mb);
  const ctrlMean = ctrlMeans.reduce((a, b) => a + b, 0) / ctrlMeans.length;
  const treatMean = treatMeans.reduce((a, b) => a + b, 0) / treatMeans.length;
  const diff = treatMean - ctrlMean;

  console.log("\nSUMMARY");
  console.log(
    `  Control mean:    ${ctrlMean.toFixed(2)} MB  [${Math.min(...ctrlMeans).toFixed(1)}–${Math.max(...ctrlMeans).toFixed(1)}]`,
  );
  console.log(
    `  Treatment mean:  ${treatMean.toFixed(2)} MB  [${Math.min(...treatMeans).toFixed(1)}–${Math.max(...treatMeans).toFixed(1)}]`,
  );
  console.log(`  Observed diff:   ${diff >= 0 ? "+" : ""}${diff.toFixed(2)} MB`);
  console.log("");
  console.log("=".repeat(60));

  // Store for later access
  window.__RUN1_RESULTS__ = { control, treatment, diff, ctrlMean, treatMean };

  return { control, treatment, diff, ctrlMean, treatMean };
}

// Auto-run
runRUN1().catch((err) => console.error("RUN 1 ERROR:", err));
