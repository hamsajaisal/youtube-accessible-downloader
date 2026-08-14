const fs = require('fs');
const path = require('path');
const os = require('os');

let settingsPath = '';
let historyPath = '';

const defaultSettings = {
  downloadFolder: path.join(os.homedir(), 'Downloads'),
  videoQuality: 'best',
  videoFormat: 'mp4',
  audioFormat: 'mp3',
  audioQuality: 'high',
  simultaneousDownloads: 2,
  skipDuplicates: true,
  embedMetadata: true,
  embedThumbnail: true,
  downloadSubtitles: false,
  subtitleLang: 'en',
  subtitleType: 'manual', // 'manual' or 'auto'
  embedSubtitles: false,
  simpleMode: true,
  autoCheckUpdates: true
};

function initSettings(appUserDataPath) {
  settingsPath = path.join(appUserDataPath, 'settings.json');
  historyPath = path.join(appUserDataPath, 'history.json');
}

function getSettings() {
  try {
    if (fs.existsSync(settingsPath)) {
      const data = fs.readFileSync(settingsPath, 'utf8');
      const loaded = JSON.parse(data);
      // Merge with defaults in case settings are missing from older versions
      return { ...defaultSettings, ...loaded };
    }
  } catch (err) {
    console.error('Failed to load settings:', err);
  }
  return { ...defaultSettings };
}

function saveSettings(settings) {
  try {
    const data = JSON.stringify(settings, null, 2);
    fs.writeFileSync(settingsPath, data, 'utf8');
    return true;
  } catch (err) {
    console.error('Failed to save settings:', err);
    return false;
  }
}

function getHistory() {
  try {
    if (fs.existsSync(historyPath)) {
      const data = fs.readFileSync(historyPath, 'utf8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.error('Failed to load history:', err);
  }
  return [];
}

function saveHistory(history) {
  try {
    const data = JSON.stringify(history, null, 2);
    fs.writeFileSync(historyPath, data, 'utf8');
    return true;
  } catch (err) {
    console.error('Failed to save history:', err);
    return false;
  }
}

function addToHistory(item) {
  const history = getHistory();
  // Add item to the beginning of the list
  const historyItem = {
    id: Date.now().toString(),
    title: item.title,
    date: new Date().toLocaleDateString(),
    location: item.location || '',
    format: item.format || '',
    status: item.status || 'Completed'
  };
  history.unshift(historyItem);
  
  // Cap history at 500 items for safety
  if (history.length > 500) {
    history.pop();
  }
  
  saveHistory(history);
}

function clearHistory() {
  return saveHistory([]);
}

module.exports = {
  initSettings,
  getSettings,
  saveSettings,
  getHistory,
  clearHistory,
  addToHistory
};
