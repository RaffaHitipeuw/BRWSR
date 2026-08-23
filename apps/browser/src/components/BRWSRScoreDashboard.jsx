import { useState, useEffect } from "react";
import { browser } from "./browserCommands";

export function BRWSRScoreDashboard() {
  const [scores, setScores] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);

  useEffect(() => {
    loadResults();
    const interval = setInterval(loadResults, 30000);
    return () => clearInterval(interval);
  }, []);

  const loadResults = async () => {
    try {
      const result = await browser.loadSessionData("benchmark_final");
      if (result) {
        const data = result;
        setScores(data.scores);
        setLastUpdated(data.timestamp);
      }
    } catch (e) {
      console.error("[BRWSRScore] Failed to load results:", e);
    }
    setLoading(false);
  };

  const ScoreBar = ({ label, score, description }) => {
    const color = score >= 80 ? "text-green-400" : score >= 60 ? "text-yellow-400" : "text-red-400";

    return (
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-gray-300">{label}</span>
          <span className={`text-sm font-mono ${color}`}>{score.toString().padStart(3)}</span>
        </div>
        <div className="h-3 bg-gray-700 rounded-full overflow-hidden">
          <div
            className={`h-full transition-all duration-500 ${
              score >= 80 ? "bg-green-500" : score >= 60 ? "bg-yellow-500" : "bg-red-500"
            }`}
            style={{ width: `${score}%` }}
          />
        </div>
        <p className="text-xs text-gray-500">{description}</p>
      </div>
    );
  };

  const GradeDisplay = ({ grade, score }) => {
    const gradeColor =
      score >= 90 ? "text-green-400" :
      score >= 80 ? "text-green-300" :
      score >= 70 ? "text-yellow-400" :
      score >= 60 ? "text-yellow-300" :
      score >= 50 ? "text-orange-400" : "text-red-400";

    return (
      <div className="text-center">
        <div className={`text-8xl font-bold ${gradeColor}`}>{grade}</div>
        <div className="text-2xl font-semibold text-white mt-2">
          {score.toFixed(1)} / 100
        </div>
        <div className="text-sm text-gray-400 mt-1">Overall Score</div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-700 rounded w-1/3"></div>
          <div className="h-32 bg-gray-700 rounded"></div>
          <div className="h-64 bg-gray-700 rounded"></div>
        </div>
      </div>
    );
  }

  const defaultScores = {
    Startup: 0,
    IdleRAM: 0,
    TabRAM: 0,
    Stability: 0,
    Overall: 0,
    Grade: "-",
  };

  const displayScores = scores || defaultScores;

  return (
    <div className="p-6 space-y-6">
      {}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">BRWSR Performance Score</h2>
          <p className="text-sm text-gray-400">
            Hardware-optimized browser for low-end devices
          </p>
        </div>
        {lastUpdated && (
          <div className="text-xs text-gray-500">
            Last benchmark: {new Date(lastUpdated).toLocaleString()}
          </div>
        )}
      </div>

      {}
      <div className="bg-gray-800 rounded-xl p-8">
        <div className="flex items-center justify-center gap-12">
          <GradeDisplay grade={displayScores.Grade} score={displayScores.Overall} />
          <div className="w-px h-32 bg-gray-700"></div>
          <div className="space-y-2">
            <p className="text-sm text-gray-400">Performance Level</p>
            <p className="text-lg font-semibold text-white">
              {displayScores.Overall >= 90 ? "Exceptional" :
               displayScores.Overall >= 80 ? "Excellent" :
               displayScores.Overall >= 70 ? "Good" :
               displayScores.Overall >= 60 ? "Acceptable" :
               displayScores.Overall >= 50 ? "Below Average" : "Needs Improvement"}
            </p>
            <p className="text-xs text-gray-500 mt-2">
              Compared to: Edge ~400 MB, Chrome ~500 MB baseline
            </p>
          </div>
        </div>
      </div>

      {}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ScoreBar
          label="Startup Time"
          score={displayScores.Startup}
          description="Target: <2.5s cold start"
        />
        <ScoreBar
          label="Idle RAM"
          score={displayScores.IdleRAM}
          description="Target: <160 MB baseline"
        />
        <ScoreBar
          label="10-Tab RAM"
          score={displayScores.TabRAM}
          description="Target: <350 MB with 10 tabs"
        />
        <ScoreBar
          label="Stability"
          score={displayScores.Stability}
          description="30-min workload growth <50 MB"
        />
      </div>

      {}
      <div className="bg-gray-800 rounded-xl p-4">
        <h3 className="text-sm font-semibold text-gray-300 mb-3">Benchmark Missions</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { name: "M01", label: "Browser Compare", status: scores ? "success" : "pending" },
            { name: "M02", label: "Startup Profile", status: scores ? "success" : "pending" },
            { name: "M03", label: "Tab Stress", status: scores ? "success" : "pending" },
            { name: "M04", label: "Tab Sleep", status: scores ? "success" : "pending" },
            { name: "M05", label: "Web Content", status: scores ? "success" : "pending" },
            { name: "M06", label: "Low-End Mode", status: scores ? "success" : "pending" },
            { name: "M07", label: "Real Workload", status: scores ? "success" : "pending" },
            { name: "M08", label: "BRWSR Score", status: "active" },
          ].map((mission) => (
            <div
              key={mission.name}
              className={`px-3 py-2 rounded-lg text-center ${
                mission.status === "success" ? "bg-green-900/30 text-green-400" :
                mission.status === "active" ? "bg-blue-900/30 text-blue-400" :
                "bg-gray-700/50 text-gray-500"
              }`}
            >
              <div className="text-xs font-mono">{mission.name}</div>
              <div className="text-xs mt-0.5">{mission.label}</div>
            </div>
          ))}
        </div>
      </div>

      {}
      <button
        onClick={() => window.open("powershell://run/BRWSR-Benchmark-Master.ps1")}
        className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
      >
        Run Full Benchmark Suite
      </button>

      {}
      <div className="text-center text-xs text-gray-500 space-y-1">
        <p>BRWSR Benchmark Harness v1.0</p>
        <p>Results stored in: %USERPROFILE%\BRWSR\benchmark-results\</p>
      </div>
    </div>
  );
}

export default BRWSRScoreDashboard;
