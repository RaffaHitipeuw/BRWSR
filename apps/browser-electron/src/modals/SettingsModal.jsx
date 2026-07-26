// Settings Modal - refactored

import { useState } from 'react';
import { useSettingsStore } from '../stores/settings';
import { useHistoryStore } from '../stores/history';
import { syncHistoryToGas, testGasConnection } from '../services/gasSync';

export function SettingsModal({ onClose }) {
  const settings = useSettingsStore();
  const historyItems = useHistoryStore((s) => s.items);

  const [localSettings, setLocalSettings] = useState({
    theme: settings.theme,
    searchEngine: settings.searchEngine,
    startPage: settings.startPage,
    blockPopups: settings.blockPopups,
    sendDoNotTrack: settings.sendDoNotTrack,
    historyDownload: { ...settings.historyDownload },
  });

  const [testStatus, setTestStatus] = useState(null);
  const [syncStatus, setSyncStatus] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');

  const handleSave = () => {
    settings.setTheme(localSettings.theme);
    settings.setSearchEngine(localSettings.searchEngine);
    settings.setStartPage(localSettings.startPage);
    settings.setBlockPopups(localSettings.blockPopups);
    settings.setSendDoNotTrack(localSettings.sendDoNotTrack);
    settings.setHistoryDownloadEnabled(localSettings.historyDownload.enabled);
    if (localSettings.historyDownload.gasUrl) {
      settings.setGasUrl(localSettings.historyDownload.gasUrl);
    }
    settings.setAutoSync(localSettings.historyDownload.autoSync);
    settings.setSyncInterval(localSettings.historyDownload.syncInterval);
    onClose();
  };

  const handleTestConnection = async () => {
    if (!localSettings.historyDownload.gasUrl) {
      setErrorMessage('Enter GAS URL first');
      setTestStatus('error');
      return;
    }
    setTestStatus('testing');
    setErrorMessage('');

    const result = await testGasConnection(localSettings.historyDownload.gasUrl);
    setTestStatus(result.success ? 'success' : 'error');
    if (!result.success) setErrorMessage(result.error);
  };

  const handleManualSync = async () => {
    if (!localSettings.historyDownload.gasUrl) {
      setErrorMessage('Enter GAS URL first');
      setSyncStatus('error');
      return;
    }
    setSyncStatus('syncing');
    const result = await syncHistoryToGas(historyItems, localSettings.historyDownload.gasUrl);
    setSyncStatus(result.success ? 'success' : 'error');
  };

  const downloadFile = (content, filename, mimeType) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const updateHistoryDownload = (updates) => {
    setLocalSettings({
      ...localSettings,
      historyDownload: { ...localSettings.historyDownload, ...updates },
    });
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-[600px] max-h-[700px] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold">Settings</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {/* Appearance */}
          <section>
            <h3 className="font-medium mb-3">Appearance</h3>
            <label className="block mb-2">
              <span className="text-sm text-gray-600">Theme</span>
              <select value={localSettings.theme}
                onChange={(e) => setLocalSettings({ ...localSettings, theme: e.target.value })}
                className="w-full mt-1 p-2 border rounded-lg">
                <option value="light">Light</option>
                <option value="dark">Dark</option>
                <option value="system">System</option>
              </select>
            </label>
          </section>

          {/* Search */}
          <section>
            <h3 className="font-medium mb-3">Search</h3>
            <label className="block mb-2">
              <span className="text-sm text-gray-600">Default search engine</span>
              <select value={localSettings.searchEngine}
                onChange={(e) => setLocalSettings({ ...localSettings, searchEngine: e.target.value })}
                className="w-full mt-1 p-2 border rounded-lg">
                <option value="google">Google</option>
                <option value="duckduckgo">DuckDuckGo</option>
                <option value="bing">Bing</option>
              </select>
            </label>
          </section>

          {/* Startup */}
          <section>
            <h3 className="font-medium mb-3">Startup</h3>
            <label className="block mb-2">
              <span className="text-sm text-gray-600">Open new tabs with</span>
              <select value={localSettings.startPage}
                onChange={(e) => setLocalSettings({ ...localSettings, startPage: e.target.value })}
                className="w-full mt-1 p-2 border rounded-lg">
                <option value="newTab">New Tab page</option>
                <option value="homepage">Homepage</option>
                <option value="blank">Blank page</option>
              </select>
            </label>
          </section>

          {/* Privacy */}
          <section>
            <h3 className="font-medium mb-3">Privacy</h3>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={localSettings.blockPopups}
                onChange={(e) => setLocalSettings({ ...localSettings, blockPopups: e.target.checked })}
                className="w-4 h-4" />
              <span className="text-sm">Block pop-ups</span>
            </label>
            <label className="flex items-center gap-2 mt-2">
              <input type="checkbox" checked={localSettings.sendDoNotTrack}
                onChange={(e) => setLocalSettings({ ...localSettings, sendDoNotTrack: e.target.checked })}
                className="w-4 h-4" />
              <span className="text-sm">Send do-not-track</span>
            </label>
          </section>

          {/* History Download (GAS) */}
          <section>
            <h3 className="font-medium mb-3">History Download (GAS)</h3>
            <p className="text-xs text-gray-500 mb-3">Sync history to Google Sheets via Google Apps Script</p>

            <label className="flex items-center gap-2 mb-3">
              <input type="checkbox" checked={localSettings.historyDownload.enabled}
                onChange={(e) => updateHistoryDownload({ enabled: e.target.checked })}
                className="w-4 h-4" />
              <span className="text-sm">Enable history download</span>
            </label>

            {localSettings.historyDownload.enabled && (
              <div className="space-y-3 pl-6">
                <div>
                  <label className="block text-sm text-gray-600 mb-1">GAS Web App URL</label>
                  <input type="url" placeholder="https://script.google.com/macros/s/.../exec"
                    value={localSettings.historyDownload.gasUrl}
                    onChange={(e) => updateHistoryDownload({ gasUrl: e.target.value })}
                    className="w-full p-2 border rounded-lg text-sm" />
                </div>

                {errorMessage && <p className="text-xs text-red-500">{errorMessage}</p>}

                <div className="flex gap-2">
                  <button onClick={handleTestConnection} disabled={testStatus === 'testing'}
                    className="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg disabled:opacity-50">
                    {testStatus === 'testing' ? 'Testing...' : 'Test Connection'}
                  </button>
                  {testStatus === 'success' && <span className="text-xs text-green-500">✓ Connected</span>}
                  {testStatus === 'error' && <span className="text-xs text-red-500">✗ Failed</span>}
                </div>

                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={localSettings.historyDownload.autoSync}
                    onChange={(e) => updateHistoryDownload({ autoSync: e.target.checked })}
                    className="w-4 h-4" />
                  <span className="text-sm">Auto-sync history</span>
                </label>

                {localSettings.historyDownload.autoSync && (
                  <div className="pl-6">
                    <label className="block text-sm text-gray-600 mb-1">Sync interval (minutes)</label>
                    <input type="number" min="5" max="1440"
                      value={localSettings.historyDownload.syncInterval}
                      onChange={(e) => updateHistoryDownload({ syncInterval: parseInt(e.target.value) || 30 })}
                      className="w-20 p-2 border rounded-lg text-sm" />
                  </div>
                )}
              </div>
            )}
          </section>

          {/* Manual Export */}
          <section>
            <h3 className="font-medium mb-3">Manual Export</h3>
            <div className="flex gap-2 flex-wrap">
              <button onClick={() => downloadFile(useHistoryStore.getState().exportAsCSV(), 'history.csv', 'text/csv')}
                className="px-3 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg flex items-center gap-2">
                Export CSV
              </button>
              <button onClick={() => downloadFile(useHistoryStore.getState().exportAsJSON(), 'history.json', 'application/json')}
                className="px-3 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg flex items-center gap-2">
                Export JSON
              </button>
              <button onClick={handleManualSync}
                disabled={syncStatus === 'syncing' || !localSettings.historyDownload.enabled}
                className="px-3 py-2 text-sm bg-blue-500 text-white hover:bg-blue-600 rounded-lg disabled:opacity-50">
                {syncStatus === 'syncing' ? 'Syncing...' : 'Sync Now'}
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-2">{historyItems.length} items in history</p>
          </section>
        </div>

        <div className="p-4 border-t flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
          <button onClick={handleSave} className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600">Save</button>
        </div>
      </div>
    </div>
  );
}
