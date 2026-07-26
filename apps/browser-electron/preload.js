// Preload script - exposes safe APIs to renderer

const { contextBridge, ipcRenderer } = require('electron');

// ─── Window Controls ──────────────────────────────────────────────────────────
const windowAPI = {
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),
  isMaximized: () => ipcRenderer.invoke('window-is-maximized'),
  onMaximizedChange: (callback) => {
    ipcRenderer.on('maximized-change', (_event, isMaximized) => callback(isMaximized));
  },
};

// ─── Download Events ─────────────────────────────────────────────────────────
const downloadAPI = {
  onDownloadStarted: (callback) => {
    ipcRenderer.on('download-started', (_event, data) => callback(data));
  },
};

// ─── Export to renderer ───────────────────────────────────────────────────────
contextBridge.exposeInMainWorld('electronAPI', {
  ...windowAPI,
  ...downloadAPI,
});
