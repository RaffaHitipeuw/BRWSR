import { useState, useCallback, useEffect, useRef } from "react";
import { browser } from "./browserCommands";

export function Run1Panel({ onClose }) {
  const [status, setStatus] = useState("READY — Click RUN to begin");
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState({ control: [], treatment: [] });
  const resultsRef = useRef(results);
  resultsRef.current = results;

  const autoStartRan = useRef(false);

  useEffect(() => {
    if (autoStartRan.current) return;
    autoStartRan.current = true;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        console.info("[Run1Panel] Checking benchmark mode...");
        const isBenchmark = await browser.isBenchmarkMode();
        console.info("[Run1Panel] isBenchmarkMode =", isBenchmark);
        if (!cancelled && isBenchmark) {
          setStatus("AUTO-STARTING HARNESS (--benchmark mode)...");
          console.info("[Run1Panel] Starting harness...");
          await new Promise(r => setTimeout(r, 100));
          if (!cancelled) {
            console.info("[Run1Panel] Calling runAll()...");
            runAll();
          }
        } else {
          console.info("[Run1Panel] NOT in benchmark mode, skipping auto-start");
        }
      } catch (e) {
        console.error("[Run1Panel] Auto-start error:", e);
      }
    }, 300);
    return () => { cancelled = true; clearTimeout(timer); };
  }, []);

  const runBenchmark = useCallback(async (condition) => {
    console.info(`[Run1Panel] runBenchmark called: ${condition}`);
    setStatus(`${condition.toUpperCase()}: Starting benchmark...`);

    try {
      console.info(`[Run1Panel] Calling browser.testLongCommand...`);
      const raw = await browser.testLongCommand(5);
      console.info(`[Run1Panel] testLongCommand result:`, raw);
      if (!raw) {
        console.error("[Run1Panel] testLongCommand returned null!");
        setStatus(`${condition.toUpperCase()}: ERROR: null result`);
        return;
      }

      setStatus(
        `${condition.toUpperCase()}: test_long_command returned "${raw}" in 5s`,
      );
    } catch (err) {
      console.error("[Run1Panel] runBenchmark error:", err);
      setStatus(`ERROR: ${err}`);
    }
  }, []);

  const runAll = useCallback(async () => {
    console.info("[Run1Panel] runAll() starting");
    setRunning(true);
    setResults({ control: [], treatment: [] });
    console.info("[Run1Panel] Starting 3 control runs...");
    for (let i = 0; i < 3; i++) {
      console.info(`[Run1Panel] Starting control run ${i + 1}/3`);
      setStatus(`Control run ${i + 1}/3...`);
      console.info(`[Run1Panel] About to call runBenchmark(control)...`);
      await runBenchmark("control");
      console.info(`[Run1Panel] runBenchmark(control) returned`);
      await new Promise((r) => setTimeout(r, 2000));
    }

    console.info("[Run1Panel] Starting 3 treatment runs...");
    for (let i = 0; i < 3; i++) {
      console.info(`[Run1Panel] Starting treatment run ${i + 1}/3`);
      setStatus(`Treatment run ${i + 1}/3...`);
      console.info(`[Run1Panel] About to call runBenchmark(treatment)...`);
      await runBenchmark("treatment");
      console.info(`[Run1Panel] runBenchmark(treatment) returned`);
      await new Promise((r) => setTimeout(r, 2000));
    }

    console.info("[Run1Panel] All runs complete, saving results...");
    setRunning(false);
    setStatus("DONE — Saving results...");

    const liveResults = resultsRef.current;
    try {
      await browser.saveBenchmarkResults(liveResults);
      console.info("[Run1Panel] Results saved:", JSON.stringify(liveResults));
    } catch (e) {
      console.error("[Run1Panel] Save error:", e);
    }

    try {
      await browser.exitApp();
    } catch (e) {
      console.error("[Run1Panel] Exit error:", e);
    }
  }, [runBenchmark]);

  const ctrlMeans = results.control.map((r) => r.mean_mb);
  const treatMeans = results.treatment.map((r) => r.mean_mb);
  const ctrlMean =
    ctrlMeans.length > 0 ? ctrlMeans.reduce((a, b) => a + b, 0) / ctrlMeans.length : 0;
  const treatMean =
    treatMeans.length > 0 ? treatMeans.reduce((a, b) => a + b, 0) / treatMeans.length : 0;
  const diff = treatMean - ctrlMean;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-[600px] max-h-[80vh] overflow-y-auto">
        {}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700">
          <div>
            <h2 className="text-white font-semibold text-lg">RUN 1: Lifecycle Overhead</h2>
            <p className="text-gray-400 text-xs mt-0.5">
              Ctrl+Shift+R to toggle &nbsp;|&nbsp; Metric: RSS &nbsp;|&nbsp; Fresh GetProcessInfos()
              per sample
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-xl leading-none px-1"
          >
            ×
          </button>
        </div>

        {}
        <div className="px-5 py-3 border-b border-gray-800">
          <p className="text-gray-300 text-sm font-mono">{status}</p>
        </div>

        {}
        <div className="px-5 py-4 flex gap-3 border-b border-gray-800">
          <button
            onClick={runAll}
            disabled={running}
            className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white rounded-lg text-sm font-medium transition-colors"
          >
            {running ? "Running..." : "RUN ALL (3+3)"}
          </button>
          <button
            onClick={() => runBenchmark("control")}
            disabled={running}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 text-white rounded-lg text-sm transition-colors"
          >
            Control Only
          </button>
          <button
            onClick={() => runBenchmark("treatment")}
            disabled={running}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 text-white rounded-lg text-sm transition-colors"
          >
            Treatment Only
          </button>
        </div>

        {}
        <div className="px-5 py-4 space-y-4">
          {}
          {results.control.length > 0 && results.treatment.length > 0 && (
            <div className="bg-gray-800 rounded-lg p-4">
              <h3 className="text-gray-300 text-sm font-semibold mb-2">Summary</h3>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-gray-400">Control (lifecycle OFF)</p>
                  <p className="text-white font-mono text-lg">{ctrlMean.toFixed(2)} MB</p>
                  <p className="text-gray-500 text-xs">{results.control.length} runs</p>
                </div>
                <div>
                  <p className="text-gray-400">Treatment (lifecycle ON)</p>
                  <p className="text-white font-mono text-lg">{treatMean.toFixed(2)} MB</p>
                  <p className="text-gray-500 text-xs">{results.treatment.length} runs</p>
                </div>
              </div>
              <div className="mt-3 pt-3 border-t border-gray-700">
                <p className="text-gray-400 text-sm">Observed difference (treatment − control)</p>
                <p
                  className={`font-mono text-lg ${diff >= 0 ? "text-yellow-400" : "text-cyan-400"}`}
                >
                  {diff >= 0 ? "+" : ""}
                  {diff.toFixed(2)} MB
                </p>
                <p className="text-gray-500 text-xs mt-1">
                  eviction_completed in all runs:{" "}
                  {results.control.every((r) => r.eviction_completed === 0) &&
                  results.treatment.every((r) => r.eviction_completed === 0)
                    ? "0 ✓"
                    : "NON-ZERO ✗"}
                </p>
              </div>
            </div>
          )}

          {}
          {results.control.length > 0 && (
            <div>
              <h3 className="text-gray-400 text-xs font-semibold uppercase mb-2">Control runs</h3>
              <div className="space-y-1">
                {results.control.map((r, i) => (
                  <div
                    key={r.run_id}
                    className="flex items-center gap-4 text-sm font-mono text-gray-300 bg-gray-800/50 rounded px-3 py-1.5"
                  >
                    <span className="text-gray-500 w-16">run {i + 1}</span>
                    <span>mean {r.mean_mb} MB</span>
                    <span>peak {r.peak_mb} MB</span>
                    <span className="text-gray-500">ev={r.eviction_completed}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {}
          {results.treatment.length > 0 && (
            <div>
              <h3 className="text-gray-400 text-xs font-semibold uppercase mb-2">Treatment runs</h3>
              <div className="space-y-1">
                {results.treatment.map((r, i) => (
                  <div
                    key={r.run_id}
                    className="flex items-center gap-4 text-sm font-mono text-gray-300 bg-gray-800/50 rounded px-3 py-1.5"
                  >
                    <span className="text-gray-500 w-16">run {i + 1}</span>
                    <span>mean {r.mean_mb} MB</span>
                    <span>peak {r.peak_mb} MB</span>
                    <span className="text-gray-500">ev={r.eviction_completed}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {results.control.length === 0 && results.treatment.length === 0 && (
            <p className="text-gray-500 text-sm text-center py-8">
              No results yet. Click RUN to begin.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
