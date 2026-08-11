// RUN 0: WebView2 Telemetry Smoke Test
//
// P0 VALIDATION - Tests that benchmark harness is attached to actual WebView2
//
// Acceptance Criteria:
// [ ] environment_found = true
// [ ] process_count > 0
// [ ] browser_count >= 1
// [ ] renderer_count >= 1  ← MUST be >= 1 if real page loaded
//
// If renderer_count == 0 → FAIL HARD

import { browser } from "./components/browserCommands";
import type { WebView2ProcessSnapshot } from "./components/browserCommands";

interface SmokeTestResult {
  passed: boolean;
  environment_found: boolean;
  process_count: number;
  browser_count: number;
  renderer_count: number;
  gpu_count: number;
  helper_count: number;
  total_memory_mb: number;
  processes: Array<{ pid: number; kind: string; memory_mb: number }>;
  errors: string[];
}

async function runSmokeTest(): Promise<SmokeTestResult> {
  const errors: string[] = [];
  let snapshot: WebView2ProcessSnapshot | null = null;

  console.log("=".repeat(60));
  console.log("RUN 0: WebView2 Telemetry Smoke Test");
  console.log("=".repeat(60));
  console.log();

  // Step 1: Ensure WebView is active (load a page)
  console.log("[1/4] Ensuring WebView is active...");
  try {
    const webviewState = (await browser.getWebViewState()) as { state?: string } | null;
    console.log(`  WebView state: ${webviewState?.state ?? "unknown"}`);

    if (webviewState?.state === "Uninitialized" || webviewState?.state === "Destroyed") {
      console.log("  Creating WebView with test page...");
      await browser.navigate("https://www.example.com");
      await new Promise((resolve) => setTimeout(resolve, 3000)); // Wait for load
    }
  } catch (err) {
    errors.push(`Failed to ensure WebView active: ${err}`);
  }

  // Step 2: Get authoritative WebView2 process snapshot
  console.log("[2/4] Getting WebView2 process snapshot...");
  try {
    snapshot = await browser.getWebview2ProcessSnapshot();

    if (!snapshot) {
      errors.push("getWebview2ProcessSnapshot returned null");
    }
  } catch (err) {
    errors.push(`Failed to get WebView2 snapshot: ${err}`);
  }

  // Step 3: Validate results
  console.log("[3/4] Validating results...");
  console.log();

  const result: SmokeTestResult = {
    passed: false,
    environment_found: snapshot?.environment_found ?? false,
    process_count: snapshot?.process_count ?? 0,
    browser_count: snapshot?.browser_count ?? 0,
    renderer_count: snapshot?.renderer_count ?? 0,
    gpu_count: snapshot?.gpu_count ?? 0,
    helper_count: snapshot?.helper_count ?? 0,
    total_memory_mb: snapshot?.total_memory_mb ?? 0,
    processes: snapshot?.processes ?? [],
    errors,
  };

  // Step 4: Output results
  console.log("[4/4] Results:");
  console.log();

  console.log("  WebView2 Process Group:");
  console.log(`    environment_found: ${result.environment_found}`);
  console.log(`    process_count:    ${result.process_count}`);
  console.log(`    browser_count:   ${result.browser_count}`);
  console.log(`    renderer_count:  ${result.renderer_count}`);
  console.log(`    gpu_count:      ${result.gpu_count}`);
  console.log(`    helper_count:   ${result.helper_count}`);
  console.log(`    total_memory:    ${result.total_memory_mb.toFixed(1)} MB`);
  console.log();

  if (result.processes.length > 0) {
    console.log("  Individual Processes:");
    for (const proc of result.processes) {
      console.log(
        `    PID ${proc.pid.toString().padStart(6)}: ${proc.kind.padEnd(10)} ${proc.memory_mb.toFixed(1).padStart(8)} MB`,
      );
    }
    console.log();
  }

  // Validation checks
  console.log("  Acceptance Criteria:");
  const checks = [
    { name: "environment_found", pass: result.environment_found, requirement: "= true" },
    { name: "process_count", pass: result.process_count > 0, requirement: "> 0" },
    { name: "browser_count", pass: result.browser_count >= 1, requirement: ">= 1" },
    { name: "renderer_count", pass: result.renderer_count >= 1, requirement: ">= 1 (SMOKE TEST)" },
  ];

  let allPassed = true;
  for (const check of checks) {
    const status = check.pass ? "✓ PASS" : "✗ FAIL";
    console.log(`    ${status}  ${check.name} ${check.requirement}`);
    if (!check.pass) {
      allPassed = false;
    }
  }
  console.log();

  // Hard fail conditions
  if (result.renderer_count === 0) {
    console.log("  !!! HARD FAIL: renderer_count == 0 !!!");
    console.log("  This means no WebView2 renderer processes were detected.");
    console.log("  The benchmark harness is NOT attached to the production WebView2.");
    allPassed = false;
  }

  if (errors.length > 0) {
    console.log("  Errors encountered:");
    for (const err of errors) {
      console.log(`    - ${err}`);
    }
    allPassed = false;
  }

  result.passed = allPassed;

  console.log();
  console.log("=".repeat(60));
  console.log(`RUN 0: ${result.passed ? "PASS" : "FAIL"}`);
  console.log("=".repeat(60));
  console.log();

  if (!result.passed) {
    console.log("INVARIANT VIOLATIONS DETECTED");
    console.log("- DO NOT proceed to RUN 1/2/3");
    console.log("- Investigate why WebView2 processes are not being detected");
    console.log("- Check: Is WebView actually created? Is content loaded?");
    console.log();
  }

  return result;
}

// Export for use
export { runSmokeTest };
export type { SmokeTestResult };

// Auto-run if executed directly
if (typeof window !== "undefined") {
  // In browser context, attach to window for console access
  (window as unknown as { runSmokeTest: typeof runSmokeTest }).runSmokeTest = runSmokeTest;
}

// Log usage
console.log("RUN 0 Smoke Test loaded.");
console.log("Run with: runSmokeTest()");
console.log();
