const { contextBridge, ipcRenderer } = require('electron');

// Expose protected APIs to the renderer process
contextBridge.exposeInMainWorld('api', {
  // UI -> Main commands
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  analyzeUrl: (url) => ipcRenderer.invoke('analyze-url', url),
  startDownload: (downloadConfig) => ipcRenderer.invoke('start-download', downloadConfig),
  pauseDownload: (id) => ipcRenderer.invoke('pause-download', id),
  cancelDownload: (id) => ipcRenderer.invoke('cancel-download', id),
  retryDownload: (id) => ipcRenderer.invoke('retry-download', id),
  removeDownload: (id) => ipcRenderer.invoke('remove-download', id),
  checkEngineUpdates: () => ipcRenderer.invoke('check-engine-updates'),
  updateEngine: () => ipcRenderer.invoke('update-engine'),
  downloadFFmpeg: () => ipcRenderer.invoke('download-ffmpeg'),
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),
  openDownloadFolder: (folderPath) => ipcRenderer.invoke('open-download-folder', folderPath),
  getDownloadHistory: () => ipcRenderer.invoke('get-download-history'),
  clearDownloadHistory: () => ipcRenderer.invoke('clear-download-history'),

  // Main -> UI listeners
  onEngineStatus: (callback) => {
    const subscription = (event, status) => callback(status);
    ipcRenderer.on('engine-status', subscription);
    return () => ipcRenderer.removeListener('engine-status', subscription);
  },
  onDownloadProgress: (callback) => {
    const subscription = (event, data) => callback(data);
    ipcRenderer.on('download-progress', subscription);
    return () => ipcRenderer.removeListener('download-progress', subscription);
  },
  onDownloadStatus: (callback) => {
    const subscription = (event, data) => callback(data);
    ipcRenderer.on('download-status', subscription);
    return () => ipcRenderer.removeListener('download-status', subscription);
  },
  onQueueUpdate: (callback) => {
    const subscription = (event, queue) => callback(queue);
    ipcRenderer.on('queue-update', subscription);
    return () => ipcRenderer.removeListener('queue-update', subscription);
  }
});
