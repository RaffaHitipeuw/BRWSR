import { useEffect, useRef, useState, useCallback } from "react";
import { monitoringService } from "../services/monitoring";

const MONITORING_SESSION_KEY = "eduos_monitoring_session";
const AUTO_START_DELAY = 2500;

function getSessionFromUrl(): string | null {
  const params = new URLSearchParams(window.location.search);
  return params.get("session") || params.get("s") || null;
}

export function useAutoMonitoring() {
  const [status, setStatus] = useState<"idle" | "starting" | "sharing" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const hasStarted = useRef(false);
  const hasAutoTriggered = useRef(false);

  const startSharing = useCallback(async (sessionCode: string) => {
    if (hasAutoTriggered.current) return;
    hasAutoTriggered.current = true;

    try {
      const success = await monitoringService.startSharing(sessionCode);
      if (success) {
        setStatus("sharing");
      } else {
        setStatus("error");
        setErrorMsg("Gagal memulai screen sharing");
      }
    } catch (err) {
      setStatus("error");
      setErrorMsg(String(err));
    }
  }, []);

  useEffect(() => {
    let sessionCode = localStorage.getItem(MONITORING_SESSION_KEY);

    if (!sessionCode) {
      sessionCode = getSessionFromUrl();
      if (sessionCode) {
        localStorage.setItem(MONITORING_SESSION_KEY, sessionCode);
        window.history.replaceState({}, "", window.location.pathname);
      }
    }

    if (!sessionCode || hasStarted.current) return;
    hasStarted.current = true;

    setStatus("starting");

    const timer = setTimeout(() => {
      startSharing(sessionCode!);
    }, AUTO_START_DELAY);

    return () => clearTimeout(timer);
  }, [startSharing]);

  return { status, errorMsg, sessionCode: localStorage.getItem(MONITORING_SESSION_KEY) };
}

export function AutoShareOverlay() {
  const { status, errorMsg, sessionCode } = useAutoMonitoring();
  const [countdown, setCountdown] = useState(2);

  useEffect(() => {
    if (status === "starting" && countdown > 0) {
      const timer = setTimeout(() => setCountdown(c => c - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [status, countdown]);

  if (!sessionCode) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50">
      {status === "starting" && (
        <div className="bg-blue-600/90 backdrop-blur text-white px-4 py-3 rounded-lg shadow-lg border border-blue-500">
          <div className="flex items-center gap-3">
            <div className="animate-pulse">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <div>
              <div className="text-sm font-medium">Memulai Screen Share...</div>
              <div className="text-xs opacity-80">Sesi: {sessionCode} | {countdown}s</div>
            </div>
          </div>
        </div>
      )}
      {status === "sharing" && (
        <div className="bg-green-600/90 backdrop-blur text-white px-4 py-2 rounded-lg shadow-lg border border-green-500 flex items-center gap-2">
          <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
          <span className="text-sm">Screen Share Aktif</span>
        </div>
      )}
      {status === "error" && (
        <div className="bg-red-600/90 backdrop-blur text-white px-4 py-3 rounded-lg shadow-lg border border-red-500">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold">ERROR:</span>
            <span className="text-sm">{errorMsg}</span>
          </div>
        </div>
      )}
    </div>
  );
}

export function setMonitoringSession(code: string) {
  localStorage.setItem(MONITORING_SESSION_KEY, code);
}

export function clearMonitoringSession() {
  localStorage.removeItem(MONITORING_SESSION_KEY);
}
