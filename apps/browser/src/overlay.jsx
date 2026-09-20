import React, { useState, useEffect } from "react";
import ReactDOM from "react-dom/client";
import "./index.css";

// ─── ICONS (inline SVG, tanpa dependency) ───────────────────────────────────
const HistoryIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
       strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 12a9 9 0 1 0 3-6.7" />
    <path d="M3 4v5h5" />
    <path d="M12 7v5l3 2" />
  </svg>
);

const DownloadIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
       strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 4v11" />
    <path d="m7 11 5 5 5-5" />
    <path d="M5 20h14" />
  </svg>
);

// ─── MENU CONFIG ────────────────────────────────────────────────────────────
const MENU_ITEMS = [
  { id: "history",   label: "History",   shortcut: "Ctrl+H", icon: <HistoryIcon /> },
  { id: "downloads", label: "Downloads", shortcut: "Ctrl+J", icon: <DownloadIcon /> },
];

// ─── STYLES ─────────────────────────────────────────────────────────────────
const styles = {
  root: {
    width: "100vw",
    height: "100vh",
    margin: 0,
    padding: 0,
    background: "transparent",
    fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif",
    boxSizing: "border-box",
    overflow: "hidden",
    userSelect: "none",
  },
  menu: {
    width: "100%",
    height: "100%",
    boxSizing: "border-box",
    padding: 6,
    background: "#ffffff",
    border: "1px solid rgba(0,0,0,0.12)",
    borderRadius: 10,
    boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
    display: "flex",
    flexDirection: "column",
    gap: 2,
  },
  item: (hovered) => ({
    display: "flex",
    alignItems: "center",
    gap: 12,
    width: "100%",
    padding: "9px 12px",
    border: "none",
    borderRadius: 6,
    background: hovered ? "rgba(0,0,0,0.07)" : "transparent",
    color: "#1f1f1f",
    fontSize: 13.5,
    fontFamily: "inherit",
    textAlign: "left",
    cursor: "default",
    transition: "background 90ms ease",
    outline: "none",
  }),
  label: { flex: 1 },
  shortcut: { fontSize: 11.5, color: "#7a7a7a" },
};

// ─── MENU ITEM ──────────────────────────────────────────────────────────────
function MenuItem({ item, onSelect }) {
  const [hovered, setHovered] = useState(false);

  return (
    <button
      style={styles.item(hovered)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => onSelect(item.id)}
    >
      {item.icon}
      <span style={styles.label}>{item.label}</span>
      <span style={styles.shortcut}>{item.shortcut}</span>
    </button>
  );
}

// ─── MENU ───────────────────────────────────────────────────────────────────
function HamburgerMenu() {
  const handleSelect = (id) => {
    console.info("[OVERLAY:JS] Menu item selected:", id);
    // Emit event to main window
    import("@tauri-apps/api/event").then(({ emit }) => {
      emit("overlay-new-tab", { action: id }).catch(console.warn);
      // Also hide the overlay
      import("@tauri-apps/api/core").then(({ invoke }) => {
        invoke("hide_native_overlay").catch(console.warn);
      });
    });
  };

  return (
    <div style={styles.menu}>
      {MENU_ITEMS.map((item) => (
        <MenuItem key={item.id} item={item} onSelect={handleSelect} />
      ))}
    </div>
  );
}

// ─── OVERLAY APP ────────────────────────────────────────────────────────────
function OverlayApp() {
  const [overlayType, setOverlayType] = useState("bookmark_menu");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const type = params.get("type") || "bookmark_menu";
    setOverlayType(type);
    console.info("[OVERLAY:JS] Overlay mounted. overlay_type:", type);

    // Window transparan biar rounded corner + shadow kelihatan
    document.documentElement.style.background = "transparent";
    document.body.style.background = "transparent";
    document.body.style.margin = "0";
  }, []);

  return (
    <div style={styles.root}>
      <HamburgerMenu />
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <OverlayApp />
  </React.StrictMode>
);