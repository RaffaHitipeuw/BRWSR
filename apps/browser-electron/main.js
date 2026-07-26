// Main process - Optimized for maximum performance

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

// Set app icon (for Windows taskbar)
if (process.platform === 'win32') {
  app.setPath('userData', app.getPath('userData'));
}

// Enable hardware acceleration
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');
app.commandLine.appendSwitch('enable-hardware-overlays', 'single-fullscreen,single-on-top,underlay');

// ─── Window State ─────────────────────────────────────────────────────────────
let mainWindow = null;

// ─── Create Window ────────────────────────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    frame: false,
    backgroundColor: '#1a1a1a',
    show: false, // Don't show until ready
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      webviewTag: true,
      spellcheck: false,
      enableWebSQL: false,
    },
  });

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  const isDev = !app.isPackaged;

  if (isDev) {
    mainWindow.loadURL('http://localhost:3000');
    mainWindow.webContents.openDevTools();
  } else {
    // Production: dist folder is inside resources/app/
    mainWindow.loadFile(path.join(__dirname, 'dist', 'index.html'));
  }

  // Attach download handler to all webviews
  mainWindow.webContents.on('did-attach-webview', (event, webContents) => {
    webContents.session.on('will-download', (event2, downloadItem) => {
      mainWindow.webContents.send('download-started', {
        fileName: downloadItem.getFilename(),
        url: downloadItem.getURL(),
        totalBytes: downloadItem.getTotalBytes(),
      });
    });
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ─── Window IPC Handlers ──────────────────────────────────────────────────────
ipcMain.on('window-minimize', () => {
  mainWindow?.minimize();
});

ipcMain.on('window-maximize', () => {
  if (mainWindow?.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow?.maximize();
  }
});

ipcMain.on('window-close', () => {
  mainWindow?.close();
});

ipcMain.handle('window-is-maximized', () => {
  return mainWindow?.isMaximized() ?? false;
});

// ─── App Lifecycle ────────────────────────────────────────────────────────────
app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
