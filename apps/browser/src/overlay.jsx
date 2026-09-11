import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";

// Simple overlay component - very visible test UI
function OverlayPanel() {
  return (
    <div
      style={{
        width: 320,
        height: 280,
        background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
        borderRadius: 16,
        boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.5)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        fontFamily: "system-ui, -apple-system, sans-serif",
        color: "white",
        border: "3px solid rgba(255, 255, 255, 0.3)",
      }}
    >
      <div
        style={{
          fontSize: 28,
          fontWeight: 700,
          marginBottom: 16,
          textShadow: "0 2px 4px rgba(0,0,0,0.3)",
        }}
      >
        NATIVE OVERLAY TEST
      </div>
      <div
        style={{
          fontSize: 16,
          textAlign: "center",
          lineHeight: 1.5,
          opacity: 0.95,
        }}
      >
        If you can see this above Google,
        <br />
        the overlay architecture works.
      </div>
      <div
        style={{
          marginTop: 20,
          padding: "8px 16px",
          background: "rgba(255,255,255,0.2)",
          borderRadius: 8,
          fontSize: 13,
          fontWeight: 500,
        }}
      >
        Ctrl+Shift+P to hide
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <OverlayPanel />
  </React.StrictMode>
);
