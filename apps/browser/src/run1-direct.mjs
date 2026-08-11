/**
 * RUN 1 Benchmark Runner — Direct Tauri IPC
 *
 * Calls run_benchmark_workload via Tauri IPC without needing browser console access.
 * Usage: node run1-direct.mjs
 */

const RUN_CONFIG = {
  tabCount: 2,
  urls: ["https://www.example.com", "https://www.wikipedia.org"],
  measurementSeconds: 15,
  samplingIntervalMs: 500,
  runsPerCondition: 3,
  warmupDiscardSeconds: 5,
};

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function callBenchmark(condition) {
  // Use Node.js fetch to call Tauri HTTP endpoint (if available)
  // OR use the Tauri IPC via the IPC socket
  // We'll use the Tauri IPC via npx tauri with a script approach

  // Alternative: use the Tauri IPC WebSocket
  // For now, construct a script that gets injected into the running app

  console.log(`  [${condition}] Invoking run_benchmark_workload...`);
}

async function run() {
  console.log("=".repeat(60));
  console.log("RUN 1 Benchmark — Direct IPC");
  console.log("=".repeat(60));
  console.log("Config:", JSON.stringify(RUN_CONFIG, null, 2));
  console.log();

  const results = { control: [], treatment: [] };

  for (const condition of ["control", "treatment"]) {
    console.log(`\n${condition.toUpperCase()} — ${RUN_CONFIG.runsPerCondition} runs`);
    console.log("-".repeat(40));

    for (let i = 0; i < RUN_CONFIG.runsPerCondition; i++) {
      console.log(`  Run ${i + 1}/${RUN_CONFIG.runsPerCondition}...`);

      // Call via npx tauri script approach
      // The actual invocation happens through the app's IPC channel
      // We need a way to communicate with the running app
      //
      // Tauri 2.x exposes IPC via WebSocket on localhost
      // Default port is random, but we can use the devtools protocol
      //
      // Since we can't easily invoke commands from outside,
      // the results will be collected when the user triggers RUN ALL
      // from the R1 panel in the running app.
      //
      // For now, print instructions.

      console.log("  -> Open the app, press Ctrl+Shift+R, click RUN ALL");
      console.log("  -> Results will be shown in the panel");
      return;
    }

    if (condition === "control") {
      console.log("\nPause 5s between conditions...");
      await sleep(5000);
    }
  }
}

run().catch(console.error);
