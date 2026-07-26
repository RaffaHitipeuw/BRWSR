import { useEffect } from "react";

// Keyboard shortcuts hook
export function useBrowserShortcuts(
  onBack: () => void,
  onForward: () => void,
  onReload: () => void,
  onNewTab: () => void,
  onCloseTab: () => void,
) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) {
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key === "t") {
        e.preventDefault();
        onNewTab();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "w") {
        e.preventDefault();
        onCloseTab();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "r") {
        e.preventDefault();
        onReload();
      }
      if (e.key === "F5") {
        e.preventDefault();
        onReload();
      }
      if (e.altKey && e.key === "ArrowLeft") {
        e.preventDefault();
        onBack();
      }
      if (e.altKey && e.key === "ArrowRight") {
        e.preventDefault();
        onForward();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onBack, onForward, onReload, onNewTab, onCloseTab]);
}
