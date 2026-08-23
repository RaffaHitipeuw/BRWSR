
import { useEffect, useRef } from "react";
import { useDownloadsStore } from "../stores/downloads";

export function useDownloads() {
  const items = useDownloadsStore((s) => s.items);
  const addDownload = useDownloadsStore((s) => s.addDownload);
  const updateProgress = useDownloadsStore((s) => s.updateProgress);
  const completeDownload = useDownloadsStore((s) => s.completeDownload);
  const removeDownload = useDownloadsStore((s) => s.removeDownload);
  const clearCompleted = useDownloadsStore((s) => s.clearCompleted);

  const handlerRef = useRef<(event: Event) => void>();

  useEffect(() => {
    const handleDownloadStarted = (data: { fileName: string; url: string; totalBytes: number }) => {
      const { fileName, url, totalBytes } = data;
      addDownload(fileName, url, totalBytes);
      console.log("Download started:", fileName);
    };

    if (!handlerRef.current) {
      handlerRef.current = (event: Event) => {
        const customEvent = event as CustomEvent;
        handleDownloadStarted(customEvent.detail);
      };
    }

    window.addEventListener("download-started", handlerRef.current);

    return () => {
      if (handlerRef.current) {
        window.removeEventListener("download-started", handlerRef.current);
      }
    };
  }, [addDownload]);

  const activeDownloads = items.filter((d) => d.status === "downloading");
  const completedDownloads = items.filter((d) => d.status === "completed");
  const hasActiveDownloads = activeDownloads.length > 0;

  return {
    items,
    activeDownloads,
    completedDownloads,
    hasActiveDownloads,
    addDownload,
    updateProgress,
    completeDownload,
    removeDownload,
    clearCompleted,
  };
}
