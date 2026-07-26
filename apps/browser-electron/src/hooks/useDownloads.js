// useDownloads - hook for managing downloads

import { useEffect, useCallback } from 'react';
import { useDownloadsStore } from '../stores/downloads';

export function useDownloads() {
  const items = useDownloadsStore((s) => s.items);
  const addDownload = useDownloadsStore((s) => s.addDownload);
  const updateProgress = useDownloadsStore((s) => s.updateProgress);
  const completeDownload = useDownloadsStore((s) => s.completeDownload);
  const removeDownload = useDownloadsStore((s) => s.removeDownload);
  const clearCompleted = useDownloadsStore((s) => s.clearCompleted);

  // Listen for download events from main process
  useEffect(() => {
    if (!window.electronAPI?.onDownloadStarted) return;

    const handleDownloadStarted = (data) => {
      const { fileName, url, totalBytes } = data;
      addDownload(fileName, url, totalBytes);
      console.log('Download started:', fileName);
    };

    window.electronAPI.onDownloadStarted(handleDownloadStarted);
  }, [addDownload]);

  // Computed values
  const activeDownloads = items.filter((d) => d.status === 'downloading');
  const completedDownloads = items.filter((d) => d.status === 'completed');
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
