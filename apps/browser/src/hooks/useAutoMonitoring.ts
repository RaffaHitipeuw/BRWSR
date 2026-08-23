import { useState, useEffect, useCallback } from "react";
import { monitoringService } from "../services/monitoring";

const MONITORING_SESSION_KEY = "eduos_monitoring_session";
const AUTO_CHECK_INTERVAL = 3000;

function getSessionFromUrl(): string | null {
  const params = new URLSearchParams(window.location.search);
  return params.get("session") || params.get("s") || null;
}

interface SharingStatus {
  status: "idle" | "selecting" | "sharing" | "error";
  message: string;
}

export function useAutoMonitoring() {
  const [status, setStatus] = useState<SharingStatus>({
    status: "idle",
    message: "",
  });
  const [sessionCode, setSessionCode] = useState<string | null>(null);
  const hasStarted = useEffect(() => {
    let code = localStorage.getItem(MONITORING_SESSION_KEY);

    if (!code) {
      code = getSessionFromUrl();
      if (code) {
        localStorage.setItem(MONITORING_SESSION_KEY, code);
        window.history.replaceState({}, "", window.location.pathname);
      }
    }

    if (code) {
      setSessionCode(code);
      setStatus({
        status: "idle",
        message: "Klik tombol untuk mulai screen share",
      });
    } else {
      setStatus({
        status: "idle",
        message: "Tidak ada sesi monitoring",
      });
    }

    const interval = setInterval(() => {
      if (monitoringService.getStatus().isSharing) {
        setStatus({
          status: "sharing",
          message: "Sedang di-monitor oleh guru",
        });
      }
    }, AUTO_CHECK_INTERVAL);

    return () => clearInterval(interval);
  }, []);

  const startSharing = useCallback(async () => {
    if (!sessionCode) {
      setStatus({ status: "error", message: "Tidak ada kode sesi" });
      return;
    }

    const currentStatus = monitoringService.getStatus();
    if (currentStatus.isSharing) {
      setStatus({ status: "sharing", message: "Sedang di-monitor" });
      return;
    }

    setStatus({ status: "selecting", message: "Memilih layar..." });

    try {
      const success = await monitoringService.startSharing(sessionCode);

      if (success) {
        setStatus({
          status: "sharing",
          message: "Layar sedang di-share",
        });
      } else {
        setStatus({
          status: "error",
          message: "Gagal memulai. Klik lagi untuk coba.",
        });
      }
    } catch (err) {
      setStatus({
        status: "error",
        message: `Error: ${err}. Klik untuk coba lagi.`,
      });
    }
  }, [sessionCode]);

  return {
    status,
    sessionCode,
    startSharing,
    isSharing: status.status === "sharing",
  };
}

export function setMonitoringSession(code: string) {
  localStorage.setItem(MONITORING_SESSION_KEY, code);
}

export function clearMonitoringSession() {
  localStorage.removeItem(MONITORING_SESSION_KEY);
}
