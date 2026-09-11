import React, { useState, useEffect } from "react";
import ReactDOM from "react-dom/client";
import "./index.css";

// ─── PHASE 5: DEBUG OVERLAY — Obviously visible test ────────────────────────
// This is the ONLY overlay content for now.
// The entire purpose is to answer ONE binary question:
// "CAN THE SEPARATE TOP-LEVEL OVERLAY WINDOW APPEAR AT ALL?"
//
// When debug mode detects "debug" type or when the content hasn't loaded,
// show a giant OBVIOUS red/orange box that cannot be missed.
// ─────────────────────────────────────────────────────────────────────────────

function DebugOverlay({ overlayType }) {
  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        background: "linear-gradient(135deg, #ff6b35 0%, #f7c59f 50%, #ff6b35 100%)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        margin: 0,
        padding: 0,
        fontFamily: "system-ui, -apple-system, sans-serif",
        boxSizing: "border-box",
        overflow: "hidden",
      }}
    >
      {/* Giant obvious text */}
      <div
        style={{
          fontSize: "clamp(24px, 5vw, 64px)",
          fontWeight: 900,
          color: "white",
          textShadow: "0 4px 8px rgba(0,0,0,0.3)",
          textAlign: "center",
          marginBottom: 16,
          letterSpacing: "-0.02em",
        }}
      >
        ⚡ NATIVE OVERLAY ALIVE ⚡
      </div>

      <div
        style={{
          fontSize: "clamp(14px, 2vw, 24px)",
          color: "rgba(255,255,255,0.95)",
          textAlign: "center",
          marginBottom: 24,
          fontWeight: 500,
        }}
      >
        overlay_type = "{overlayType}"
      </div>

      <div
        style={{
          fontSize: "clamp(12px, 1.5vw, 18px)",
          color: "rgba(255,255,255,0.8)",
          textAlign: "center",
          maxWidth: "80%",
          lineHeight: 1.5,
        }}
      >
        This overlay window is a separate native WebviewWindow
        <br />
        positioned above the browser WebView via HWND_TOPMOST
      </div>

      {/* Corner markers to show edges clearly */}
      <div style={{ position: "absolute", top: 8, left: 8, width: 32, height: 32, borderTop: "4px solid white", borderLeft: "4px solid white" }} />
      <div style={{ position: "absolute", top: 8, right: 8, width: 32, height: 32, borderTop: "4px solid white", borderRight: "4px solid white" }} />
      <div style={{ position: "absolute", bottom: 8, left: 8, width: 32, height: 32, borderBottom: "4px solid white", borderLeft: "4px solid white" }} />
      <div style={{ position: "absolute", bottom: 8, right: 8, width: 32, height: 32, borderBottom: "4px solid white", borderRight: "4px solid white" }} />

      {/* Size indicator */}
      <div
        style={{
          position: "absolute",
          bottom: 16,
          fontSize: 12,
          color: "rgba(255,255,255,0.5)",
          fontFamily: "monospace",
        }}
      >
        Window should be ~500x500 physical pixels (debug mode)
      </div>
    </div>
  );
}

// Read overlay type from URL params
function OverlayApp() {
  const [overlayType, setOverlayType] = useState("unknown");

  useEffect(() => {
    // Try to read from localStorage
    try {
      const raw = localStorage.getItem("eduos-overlay-geometry");
      if (raw) {
        console.info("[OVERLAY:JS] Received geometry from localStorage:", raw);
      }
    } catch (e) {
      console.warn("[OVERLAY:JS] Failed to read localStorage:", e);
    }

    // Check URL params for type
    const params = new URLSearchParams(window.location.search);
    const type = params.get("type") || "bookmark_menu";
    setOverlayType(type);
    console.info("[OVERLAY:JS] Overlay app mounted. overlay_type:", type);
  }, []);

  console.info("[OVERLAY:JS] Rendering DebugOverlay with type:", overlayType);

  return <DebugOverlay overlayType={overlayType} />;
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <OverlayApp />
  </React.StrictMode>
);
