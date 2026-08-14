const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const engine = require('./engine');
const downloader = require('./downloader');
const settingsManager = require('./settings');

let mainWindow;

// Download Queue State
const downloadQueue = [];
let activeDownloadsCount = 0;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 950,
    height: 700,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    // Set system default colors and remove default menu for clean modern look
    autoHideMenuBar: true,
    title: 'YouTube Accessible Downloader'
  });

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

  mainWindow.on('closed', () => {
    // Kill any active subprocesses on exit
    for (const item of downloadQueue) {
      if (item.status === 'Downloading' && item.cancelToken && typeof item.cancelToken.cancel === 'function') {
        try { item.cancelToken.cancel(); } catch (e) {}
      }
    }
    mainWindow = null;
  });
}

// Push current queue state to renderer UI
function sendQueueUpdate() {
  if (!mainWindow) return;
  // Send a copy without process tokens/cancellation handles to avoid IPC serialization errors
  const serializedQueue = downloadQueue.map(item => ({
    id: item.id,
    url: item.url,
    title: item.title,
    status: item.status,
    percent: item.percent,
    speed: item.speed,
    eta: item.eta,
    totalSize: item.totalSize,
    error: item.error,
    mode: item.config.mode,
    qualityLabel: item.qualityLabel,
    downloadFolder: item.config.downloadFolder
  }));
  mainWindow.webContents.send('queue-update', serializedQueue);
}

// Manage concurrency and run downloads in queue
async function processQueue() {
  const settings = settingsManager.getSettings();
  const maxConcurrent = settings.simultaneousDownloads || 2;

  // Count active downloads
  activeDownloadsCount = downloadQueue.filter(item => item.status === 'Downloading').length;

  if (activeDownloadsCount >= maxConcurrent) {
    return;
  }

  // Find next waiting item
  const nextItem = downloadQueue.find(item => item.status === 'Waiting');
  if (!nextItem) return;

  // Mark as downloading
  nextItem.status = 'Downloading';
  nextItem.percent = 0;
  nextItem.speed = '0 KB/s';
  nextItem.eta = 'Waiting...';
  nextItem.error = '';
  sendQueueUpdate();

  // Run the download process
  nextItem.cancelToken = {};
  
  downloader.runDownloadProcess(
    nextItem.url,
    { ...nextItem.config, cancelToken: nextItem.cancelToken },
    // On Progress update
    (progress) => {
      nextItem.percent = progress.percent;
      if (progress.totalSize) nextItem.totalSize = progress.totalSize;
      if (progress.speed) nextItem.speed = progress.speed;
      if (progress.eta) nextItem.eta = progress.eta;
      if (progress.status) nextItem.status = progress.status;
      
      // Send individual progress update
      if (mainWindow) {
        mainWindow.webContents.send('download-progress', {
          id: nextItem.id,
          percent: nextItem.percent,
          speed: nextItem.speed,
          eta: nextItem.eta,
          totalSize: nextItem.totalSize,
          status: nextItem.status
        });
      }
    },
    // On Status text update
    (statusText) => {
      if (mainWindow) {
        mainWindow.webContents.send('download-status', {
          id: nextItem.id,
          message: statusText
        });
      }
    }
  ).then(() => {
    nextItem.status = 'Completed';
    nextItem.percent = 100;
    nextItem.speed = '';
    nextItem.eta = '';
    
    // Add to history
    settingsManager.addToHistory({
      title: nextItem.title,
      location: path.join(nextItem.config.downloadFolder, nextItem.title),
      format: nextItem.config.mode === 'audio' ? nextItem.config.audioFormat : nextItem.config.videoFormat,
      status: 'Completed'
    });
    
    sendQueueUpdate();
    processQueue(); // Run next
  }).catch((err) => {
    // If it was cancelled, status will be update manually or marked Cancelled
    if (nextItem.status !== 'Cancelled' && nextItem.status !== 'Paused') {
      nextItem.status = 'Failed';
      nextItem.error = err.message || 'Download failed.';
      
      settingsManager.addToHistory({
        title: nextItem.title,
        location: '',
        format: nextItem.config.mode === 'audio' ? nextItem.config.audioFormat : nextItem.config.videoFormat,
        status: `Failed: ${nextItem.error.substring(0, 60)}`
      });
    }
    
    sendQueueUpdate();
    processQueue(); // Run next
  });

  // Call processQueue again recursively to fill up remaining slots up to maxConcurrent
  setTimeout(processQueue, 50);
}

// Electron Initialization
app.whenReady().then(() => {
  const userDataPath = app.getPath('userData');
  
  // Initialize managers
  engine.initPaths(userDataPath);
  settingsManager.initSettings(userDataPath);

  createWindow();

  // Auto update check on startup if enabled
  const settings = settingsManager.getSettings();
  if (settings.autoCheckUpdates) {
    setTimeout(async () => {
      try {
        const updateInfo = await engine.checkYtDlpUpdate();
        if (updateInfo.updateAvailable && mainWindow) {
          mainWindow.webContents.send('engine-status', {
            type: 'update-available',
            current: updateInfo.current,
            latest: updateInfo.latest
          });
        }
      } catch (err) {
        console.error('Initial engine check failed:', err);
      }
    }, 3000);
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// IPC Handler Registrations

// Select local directory dialog
ipcMain.handle('select-folder', async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: 'Select Destination Folder'
  });
  if (result.canceled) return null;
  return result.filePaths[0];
});

// Analyze YouTube Link
ipcMain.handle('analyze-url', async (event, url) => {
  try {
    return await downloader.getUrlInfo(url);
  } catch (err) {
    return { error: err.message };
  }
});

// Start one or more downloads
ipcMain.handle('start-download', async (event, config) => {
  const globalSettings = settingsManager.getSettings();
  
  // Validate URLs array
  const items = config.items || [];
  
  for (const item of items) {
    // Generate unique ID for this download task
    const downloadId = Date.now().toString() + Math.random().toString(36).substring(2, 7);
    
    // Merge folder default if not specified
    const downloadFolder = config.downloadFolder || globalSettings.downloadFolder;
    
    // Determine user facing label
    let qualityLabel = '';
    if (config.mode === 'audio') {
      qualityLabel = `${config.audioFormat.toUpperCase()} (${config.audioQuality})`;
    } else {
      qualityLabel = `${config.videoFormat.toUpperCase()} (${config.videoQuality})`;
    }

    downloadQueue.push({
      id: downloadId,
      url: item.url,
      title: item.title,
      status: 'Waiting',
      percent: 0,
      speed: 'Waiting...',
      eta: 'Waiting in queue...',
      totalSize: 'Unknown',
      error: '',
      qualityLabel: qualityLabel,
      config: {
        mode: config.mode,
        videoQuality: config.videoQuality,
        videoFormat: config.videoFormat,
        audioFormat: config.audioFormat,
        audioQuality: config.audioQuality,
        downloadFolder: downloadFolder,
        downloadSubtitles: config.downloadSubtitles,
        subtitleLang: config.subtitleLang,
        subtitleType: config.subtitleType,
        embedSubtitles: config.embedSubtitles,
        embedMetadata: config.embedMetadata,
        embedThumbnail: config.embedThumbnail,
        partialDownload: config.partialDownload,
        timeStart: config.timeStart,
        timeEnd: config.timeEnd,
        skipDuplicates: globalSettings.skipDuplicates
      }
    });
  }

  sendQueueUpdate();
  processQueue();
  return true;
});

// Pause waiting/running download
ipcMain.handle('pause-download', (event, id) => {
  const item = downloadQueue.find(i => i.id === id);
  if (!item) return false;

  if (item.status === 'Downloading') {
    item.status = 'Paused';
    if (item.cancelToken && typeof item.cancelToken.cancel === 'function') {
      try { item.cancelToken.cancel(); } catch (e) {}
    }
  } else if (item.status === 'Waiting') {
    item.status = 'Paused';
  }
  
  sendQueueUpdate();
  processQueue();
  return true;
});

// Cancel and remove active/waiting download
ipcMain.handle('cancel-download', (event, id) => {
  const item = downloadQueue.find(i => i.id === id);
  if (!item) return false;

  item.status = 'Cancelled';
  if (item.cancelToken && typeof item.cancelToken.cancel === 'function') {
    try { item.cancelToken.cancel(); } catch (e) {}
  }
  
  sendQueueUpdate();
  processQueue();
  return true;
});

// Retry failed/cancelled download
ipcMain.handle('retry-download', (event, id) => {
  const item = downloadQueue.find(i => i.id === id);
  if (!item) return false;

  item.status = 'Waiting';
  item.percent = 0;
  item.error = '';
  item.speed = 'Waiting...';
  item.eta = 'Waiting in queue...';

  sendQueueUpdate();
  processQueue();
  return true;
});

// Remove item from the list completely
ipcMain.handle('remove-download', (event, id) => {
  const idx = downloadQueue.findIndex(i => i.id === id);
  if (idx === -1) return false;

  const item = downloadQueue[idx];
  if (item.status === 'Downloading' && item.cancelToken && typeof item.cancelToken.cancel === 'function') {
    try { item.cancelToken.cancel(); } catch (e) {}
  }

  downloadQueue.splice(idx, 1);
  sendQueueUpdate();
  processQueue();
  return true;
});

// Check for updates to yt-dlp
ipcMain.handle('check-engine-updates', async () => {
  try {
    return await engine.checkYtDlpUpdate();
  } catch (err) {
    return { error: err.message };
  }
});

// Update the yt-dlp binary
ipcMain.handle('update-engine', async (event) => {
  try {
    if (mainWindow) {
      mainWindow.webContents.send('engine-status', { type: 'updating', percent: 10 });
    }
    
    await engine.downloadYtDlp((percent) => {
      if (mainWindow) {
        mainWindow.webContents.send('engine-status', { type: 'updating', percent });
      }
    });

    if (mainWindow) {
      mainWindow.webContents.send('engine-status', { type: 'updated' });
    }
    return { success: true };
  } catch (err) {
    if (mainWindow) {
      mainWindow.webContents.send('engine-status', { type: 'update-failed', error: err.message });
    }
    return { success: false, error: err.message };
  }
});

// Download and install FFmpeg
ipcMain.handle('download-ffmpeg', async () => {
  try {
    if (mainWindow) {
      mainWindow.webContents.send('engine-status', { type: 'ffmpeg-downloading', percent: 5 });
    }

    await engine.downloadFFmpeg((percent) => {
      if (mainWindow) {
        mainWindow.webContents.send('engine-status', { type: 'ffmpeg-downloading', percent });
      }
    });

    if (mainWindow) {
      mainWindow.webContents.send('engine-status', { type: 'ffmpeg-completed' });
    }
    return { success: true };
  } catch (err) {
    if (mainWindow) {
      mainWindow.webContents.send('engine-status', { type: 'ffmpeg-failed', error: err.message });
    }
    return { success: false, error: err.message };
  }
});

// Settings operations
ipcMain.handle('get-settings', () => {
  // Return current settings, and also append current engine status info
  const settings = settingsManager.getSettings();
  const engines = engine.checkEngines();
  return {
    ...settings,
    ytDlpExists: engines.ytDlpExists,
    ffmpegExists: engines.ffmpegExists
  };
});

ipcMain.handle('save-settings', (event, settings) => {
  return settingsManager.saveSettings(settings);
});

// History operations
ipcMain.handle('get-download-history', () => {
  return settingsManager.getHistory();
});

ipcMain.handle('clear-download-history', () => {
  return settingsManager.clearHistory();
});

// Open download location in file explorer
ipcMain.handle('open-download-folder', async (event, folderPath) => {
  if (fs.existsSync(folderPath)) {
    shell.openPath(folderPath);
    return true;
  }
  return false;
});
