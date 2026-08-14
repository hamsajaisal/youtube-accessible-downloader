// State variables
let currentMedia = null; // Stored metadata of the analyzed item
let selectedPlaylistEntries = []; // Selected entries for playlist
let globalSettings = {}; // Saved app settings
let activeQueue = []; // Active download queue items

// DOM Elements
const srAnnouncement = document.getElementById('sr-announcement');
const tabButtons = document.querySelectorAll('.app-nav button');
const tabPanels = document.querySelectorAll('.tab-panel');
const modeToggle = document.getElementById('mode-toggle');
const inputUrl = document.getElementById('input-url');
const btnAnalyze = document.getElementById('btn-analyze');
const analyzerLoading = document.getElementById('analyzer-loading');
const mediaCard = document.getElementById('media-card');
const playlistCard = document.getElementById('playlist-card');

// Media display elements
const mediaThumbnail = document.getElementById('media-thumbnail');
const mediaTitle = document.getElementById('media-title');
const mediaUploader = document.getElementById('media-uploader');
const mediaDuration = document.getElementById('media-duration');
const playlistNotice = document.getElementById('playlist-notice');

// Config Form elements
const selectType = document.getElementById('select-type');
const selectFormat = document.getElementById('select-format');
const selectQuality = document.getElementById('select-quality');
const folderDisplay = document.getElementById('folder-display');
const btnBrowseFolder = document.getElementById('btn-browse-folder');
const advancedOptions = document.getElementById('advanced-options');
const btnStartDownload = document.getElementById('btn-start-download');

// Advanced form elements
const checkPartial = document.getElementById('check-partial');
const partialTimesRow = document.getElementById('partial-times-row');
const inputTimeStart = document.getElementById('input-time-start');
const inputTimeEnd = document.getElementById('input-time-end');
const checkSubtitles = document.getElementById('check-subtitles');
const subtitlesRow = document.getElementById('subtitles-row');
const selectSubLang = document.getElementById('select-sub-lang');
const selectSubType = document.getElementById('select-sub-type');
const checkEmbedSubs = document.getElementById('check-embed-subs');
const checkMetadata = document.getElementById('check-metadata');
const checkThumbnail = document.getElementById('check-thumbnail');

// Playlist Dialog elements
const dlgPlaylist = document.getElementById('dlg-playlist');
const playlistTitle = document.getElementById('playlist-title');
const playlistCount = document.getElementById('playlist-count');
const btnOpenPlaylistDialog = document.getElementById('btn-open-playlist-dialog');
const btnSelectAll = document.getElementById('btn-select-all');
const btnSelectNone = document.getElementById('btn-select-none');
const inputRangeStart = document.getElementById('input-range-start');
const inputRangeEnd = document.getElementById('input-range-end');
const btnSelectRange = document.getElementById('btn-select-range');
const playlistCheckboxList = document.getElementById('playlist-checkbox-list');
const selectedCountMsg = document.getElementById('selected-count-msg');
const btnCancelPlaylistDlg = document.getElementById('btn-cancel-playlist-dlg');
const btnConfirmPlaylistDlg = document.getElementById('btn-confirm-playlist-dlg');

// Update Dialog elements
const dlgUpdate = document.getElementById('dlg-update');
const updateCurrentVer = document.getElementById('update-current-ver');
const updateLatestVer = document.getElementById('update-latest-ver');
const btnUpdateYes = document.getElementById('btn-update-yes');
const btnUpdateNo = document.getElementById('btn-update-no');

// Info Dialog elements
const dlgInfo = document.getElementById('dlg-info');
const infoTitle = document.getElementById('dlg-info-title');
const infoText = document.getElementById('info-message-text');
const infoProgressContainer = document.getElementById('info-progress-container');
const infoProgressBar = document.getElementById('info-progress-bar');
const infoProgressLabel = document.getElementById('info-progress-label');
const btnInfoClose = document.getElementById('btn-info-close');

// Settings DOM Elements
const settingDefaultFolder = document.getElementById('setting-default-folder');
const btnSettingsBrowse = document.getElementById('btn-settings-browse');
const settingVideoQuality = document.getElementById('setting-default-video-quality');
const settingAudioFormat = document.getElementById('setting-default-audio-format');
const settingDuplicates = document.getElementById('setting-check-duplicates');
const settingSimultaneous = document.getElementById('setting-simultaneous');
const settingAutoUpdates = document.getElementById('setting-check-autoupdates');
const btnCheckYtdlp = document.getElementById('btn-check-ytdlp');
const btnInstallFfmpeg = document.getElementById('btn-install-ffmpeg');
const ytdlpVersionStatus = document.getElementById('yt-dlp-version-status');
const ffmpegVersionStatus = document.getElementById('ffmpeg-version-status');

// Queue DOM Elements
const queueList = document.getElementById('queue-list');
const queueEmptyState = document.getElementById('queue-empty-state');
const btnClearCompleted = document.getElementById('btn-clear-completed');
const btnClearFailed = document.getElementById('btn-clear-failed');
const queueBadge = document.getElementById('queue-badge');

// History DOM Elements
const inputSearchHistory = document.getElementById('input-search-history');
const historyList = document.getElementById('history-list');
const historyEmptyState = document.getElementById('history-empty-state');
const historyTableContainer = document.getElementById('history-table-container');
const btnClearHistory = document.getElementById('btn-clear-history');


// --- Helpers ---

// Push textual announcement to Screen Reader immediately
function announceToSR(message) {
  srAnnouncement.textContent = '';
  // Small timeout to force screen readers to detect text update
  setTimeout(() => {
    srAnnouncement.textContent = message;
  }, 100);
}

// Convert seconds into human-readable duration (e.g. 135 -> "2:15")
function formatDuration(seconds) {
  if (!seconds || isNaN(seconds)) return '0:00';
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// Dialog helper
function showInfoModal(title, textContent, showProgress = false) {
  infoTitle.textContent = title;
  infoText.textContent = textContent;
  if (showProgress) {
    infoProgressContainer.classList.remove('hidden');
    infoProgressBar.style.width = '0%';
    infoProgressLabel.textContent = 'Preparing download...';
    btnInfoClose.disabled = true;
  } else {
    infoProgressContainer.classList.add('hidden');
    btnInfoClose.disabled = false;
  }
  dlgInfo.showModal();
}

function updateInfoModalProgress(percent, labelText) {
  infoProgressBar.style.width = `${percent}%`;
  infoProgressBar.setAttribute('aria-valuenow', percent);
  infoProgressLabel.textContent = labelText;
}

function closeInfoModal() {
  dlgInfo.close();
}


// --- Initialization ---

async function initApp() {
  // Load settings
  globalSettings = await window.api.getSettings();
  
  // Set default form paths
  folderDisplay.value = globalSettings.downloadFolder;
  settingDefaultFolder.value = globalSettings.downloadFolder;
  settingVideoQuality.value = globalSettings.videoQuality;
  settingAudioFormat.value = globalSettings.audioFormat;
  settingDuplicates.checked = globalSettings.skipDuplicates;
  settingSimultaneous.value = globalSettings.simultaneousDownloads;
  settingAutoUpdates.checked = globalSettings.autoCheckUpdates;

  // Toggle Advanced settings state visually
  if (globalSettings.simpleMode === false) {
    modeToggle.setAttribute('aria-checked', 'true');
    advancedOptions.classList.remove('hidden');
  }

  updateEngineStatusDisplay();
  loadHistory();
  
  announceToSR('YouTube Accessible Downloader launched. Paste a link to begin.');

  // If FFmpeg is missing, prompt the user to download it sequentially on startup
  function checkFfmpegStartup() {
    if (!globalSettings.ffmpegExists) {
      // If the yt-dlp update consent modal or downloading progress modal is open, wait and try again
      if (dlgUpdate.open || dlgInfo.open) {
        setTimeout(checkFfmpegStartup, 2000);
        return;
      }
      
      const confirmFFmpeg = confirm('FFmpeg is missing. This helper is required to download high-quality videos (1080p, 4K) and convert audio formats.\n\nWould you like the application to download and configure FFmpeg automatically now?');
      if (confirmFFmpeg) {
        btnInstallFfmpeg.disabled = true;
        announceToSR('Starting download of FFmpeg for Windows. This might take a few minutes depending on your internet connection...');
        window.api.downloadFFmpeg().then(() => {
          btnInstallFfmpeg.disabled = false;
        });
      }
    }
  }

  checkFfmpegStartup();
}


// --- Tab Navigation ---

tabButtons.forEach(button => {
  button.addEventListener('click', () => {
    const targetPanelId = button.getAttribute('aria-controls');
    
    // Update Tab headers
    tabButtons.forEach(btn => {
      btn.setAttribute('aria-selected', 'false');
    });
    button.setAttribute('aria-selected', 'true');

    // Show/Hide Panels
    tabPanels.forEach(panel => {
      if (panel.id === targetPanelId) {
        panel.classList.remove('hidden');
        announceToSR(`Navigated to ${button.textContent.trim()} panel.`);
      } else {
        panel.classList.add('hidden');
      }
    });

    // Refresh history panel when opened
    if (targetPanelId === 'panel-history') {
      loadHistory();
    }
  });

  // Explicitly activate on Enter or Space when focused (screen reader virtual cursor compatibility)
  button.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      button.click();
      e.preventDefault();
      e.stopPropagation();
    }
  });
});

// Arrow key navigation for tabs (standard keyboard control)
document.querySelector('.app-nav ul').addEventListener('keydown', (e) => {
  const tabs = Array.from(tabButtons);
  const activeIdx = tabs.findIndex(tab => tab.getAttribute('aria-selected') === 'true');
  
  let newIdx = activeIdx;
  if (e.key === 'ArrowRight') {
    newIdx = (activeIdx + 1) % tabs.length;
  } else if (e.key === 'ArrowLeft') {
    newIdx = (activeIdx - 1 + tabs.length) % tabs.length;
  } else {
    return;
  }

  tabs[newIdx].click();
  tabs[newIdx].focus();
  e.preventDefault();
});


// --- Mode Toggle (Simple vs Advanced) ---

modeToggle.addEventListener('click', () => {
  const isChecked = modeToggle.getAttribute('aria-checked') === 'true';
  const newCheckedState = !isChecked;
  
  modeToggle.setAttribute('aria-checked', newCheckedState.toString());
  globalSettings.simpleMode = !newCheckedState;
  window.api.saveSettings(globalSettings);

  if (newCheckedState) {
    advancedOptions.classList.remove('hidden');
    announceToSR('Advanced settings mode activated. Extra configuration choices are now visible.');
  } else {
    advancedOptions.classList.add('hidden');
    announceToSR('Simple settings mode activated. Advanced choices hidden.');
  }
});


// --- Engine and dependencies checks ---

function updateEngineStatusDisplay() {
  if (globalSettings.ytDlpExists) {
    ytdlpVersionStatus.textContent = 'Installed and active.';
    ytdlpVersionStatus.style.color = 'var(--color-success)';
  } else {
    ytdlpVersionStatus.textContent = 'Missing. Please click Update to download.';
    ytdlpVersionStatus.style.color = 'var(--color-error)';
  }

  if (globalSettings.ffmpegExists) {
    ffmpegVersionStatus.textContent = 'Installed and active (Required for high quality output).';
    ffmpegVersionStatus.style.color = 'var(--color-success)';
    btnInstallFfmpeg.disabled = true;
    btnInstallFfmpeg.textContent = 'FFmpeg Configured';
  } else {
    ffmpegVersionStatus.textContent = 'Missing. High quality downloads capped at 720p. Click Install to download.';
    ffmpegVersionStatus.style.color = 'var(--color-warning)';
    btnInstallFfmpeg.disabled = false;
    btnInstallFfmpeg.textContent = 'Download & Configure FFmpeg';
  }
}

// On Startup / IPC update event checks
window.api.onEngineStatus((status) => {
  if (status.type === 'update-available') {
    // Show Yes/No modal
    updateCurrentVer.textContent = `Installed version: ${status.current}`;
    updateLatestVer.textContent = `Newest version: ${status.latest}`;
    dlgUpdate.showModal();
    announceToSR('A newer version of the yt-dlp downloader engine is available. Would you like to update?');
  } else if (status.type === 'updating') {
    // Show progress modal
    if (!dlgInfo.open) {
      showInfoModal('Updating Downloader Engine', 'Please wait while we update the yt-dlp engine...', true);
    }
    updateInfoModalProgress(status.percent, `Downloading: ${status.percent}%`);
  } else if (status.type === 'updated') {
    updateInfoModalProgress(100, 'Update Completed Successfully!');
    btnInfoClose.disabled = false;
    announceToSR('Downloader engine updated successfully.');
    // Refresh settings object
    window.api.getSettings().then(s => {
      globalSettings = s;
      updateEngineStatusDisplay();
    });
  } else if (status.type === 'update-failed') {
    showInfoModal('Update Failed', `Could not update the engine: ${status.error}`);
    announceToSR(`Downloader engine update failed. ${status.error}`);
  } else if (status.type === 'ffmpeg-downloading') {
    if (!dlgInfo.open) {
      showInfoModal('Installing FFmpeg', 'Please wait. Downloading and extracting FFmpeg for Windows...', true);
    }
    updateInfoModalProgress(status.percent, status.percent < 85 ? `Downloading archive: ${status.percent}%` : `Extracting files: ${status.percent}%`);
  } else if (status.type === 'ffmpeg-completed') {
    updateInfoModalProgress(100, 'FFmpeg Installed and Configured!');
    btnInfoClose.disabled = false;
    announceToSR('FFmpeg has been installed and configured successfully. You can now download high-quality videos.');
    window.api.getSettings().then(s => {
      globalSettings = s;
      updateEngineStatusDisplay();
    });
  } else if (status.type === 'ffmpeg-failed') {
    showInfoModal('FFmpeg Setup Failed', `Could not install FFmpeg: ${status.error}`);
    announceToSR(`FFmpeg installation failed. ${status.error}`);
  }
});


// --- Link Analysis ---

btnAnalyze.addEventListener('click', async () => {
  const url = inputUrl.value.trim();
  if (!url) {
    announceToSR('Please enter a valid YouTube link.');
    inputUrl.focus();
    return;
  }

  // Clear previous outputs
  mediaCard.classList.add('hidden');
  playlistCard.classList.add('hidden');
  currentMedia = null;
  selectedPlaylistEntries = [];

  // Show loading spinner
  analyzerLoading.classList.remove('hidden');
  btnAnalyze.disabled = true;
  announceToSR('Analyzing link. Searching YouTube files, please wait...');

  const result = await window.api.analyzeUrl(url);

  // Clear Loading
  analyzerLoading.classList.add('hidden');
  btnAnalyze.disabled = false;

  if (result.error) {
    showInfoModal('Analysis Failed', `Could not analyze this URL: ${result.error}`);
    announceToSR(`Link analysis failed. ${result.error}`);
    inputUrl.focus();
    return;
  }

  currentMedia = result;

  if (result.type === 'playlist') {
    // Show playlist card
    playlistTitle.textContent = result.title;
    playlistCount.textContent = result.videoCount;
    selectedPlaylistEntries = [...result.entries]; // select all by default
    playlistCard.classList.remove('hidden');
    
    // Display the main download configs card for playlist parameters
    // Fill options for playlists (playlists download videos)
    mediaThumbnail.src = 'https://images.unsplash.com/photo-1611162617213-7d7a39e9b1d7?w=180&h=100&fit=crop'; // Default placeholder thumb for playlists
    mediaTitle.textContent = result.title;
    mediaUploader.textContent = result.uploader || 'YouTube Playlist';
    mediaDuration.textContent = `${result.videoCount} Videos`;
    playlistNotice.classList.remove('hidden');

    populateFormatsDropdowns(true);
    mediaCard.classList.remove('hidden');
    
    announceToSR(`Playlist analyzed successfully. ${result.title}. ${result.videoCount} videos found. All selected by default.`);
    btnOpenPlaylistDialog.focus();
  } else {
    // Show single video card
    mediaThumbnail.src = result.thumbnail || '';
    mediaTitle.textContent = result.title;
    mediaUploader.textContent = result.uploader || 'YouTube Uploader';
    mediaDuration.textContent = formatDuration(result.duration);
    playlistNotice.classList.add('hidden');

    populateFormatsDropdowns(false);
    mediaCard.classList.remove('hidden');
    
    announceToSR(`Video analyzed. Title: ${result.title}. Ready to select options.`);
    selectType.focus();
  }
});


// --- Populate Dropdowns based on analysis ---

function populateFormatsDropdowns(isPlaylist = false) {
  // Clear previous values
  selectFormat.innerHTML = '';
  selectQuality.innerHTML = '';

  const downloadType = selectType.value; // 'video' or 'audio'

  if (downloadType === 'video') {
    // Video Format Options
    const optMp4 = document.createElement('option');
    optMp4.value = 'mp4';
    optMp4.textContent = 'MP4 Video (.mp4)';
    const optMkv = document.createElement('option');
    optMkv.value = 'mkv';
    optMkv.textContent = 'MKV Video (.mkv)';
    
    selectFormat.appendChild(optMp4);
    selectFormat.appendChild(optMkv);

    // Video Quality Options
    if (isPlaylist || !currentMedia.videoFormats || currentMedia.videoFormats.length === 0) {
      // For playlist or fallback, show standard list
      const qualities = [
        { val: 'best', label: 'Best Available Quality' },
        { val: '1080', label: 'Full HD (1080p)' },
        { val: '720', label: 'HD (720p)' },
        { val: '480', label: 'Standard (480p)' },
        { val: '360', label: 'Low (360p)' }
      ];
      qualities.forEach(q => {
        const opt = document.createElement('option');
        opt.value = q.val;
        opt.textContent = q.label;
        selectQuality.appendChild(opt);
      });
    } else {
      // Find actual qualities available for this single video
      // Sort heights and remove duplicates
      const uniqueHeights = [...new Set(currentMedia.videoFormats.map(f => f.height))]
        .filter(h => h > 0)
        .sort((a, b) => b - a);

      const optBest = document.createElement('option');
      optBest.value = 'best';
      optBest.textContent = 'Best Available Quality';
      selectQuality.appendChild(optBest);

      uniqueHeights.forEach(h => {
        const opt = document.createElement('option');
        opt.value = h.toString();
        
        let label = `${h}p`;
        if (h === 2160) label = '4K (2160p)';
        else if (h === 1440) label = '2K (1440p)';
        else if (h === 1080) label = 'Full HD (1080p)';
        else if (h === 720) label = 'HD (720p)';
        else if (h === 480) label = 'Standard (480p)';
        else if (h === 360) label = 'Low (360p)';

        opt.textContent = label;
        selectQuality.appendChild(opt);
      });
    }
  } else {
    // Audio Format Options
    const audioFormats = [
      { val: 'mp3', label: 'MP3 (.mp3)' },
      { val: 'm4a', label: 'M4A (.m4a)' },
      { val: 'wav', label: 'WAV (.wav)' },
      { val: 'flac', label: 'FLAC (.flac)' },
      { val: 'opus', label: 'Opus (.opus)' }
    ];
    audioFormats.forEach(f => {
      const opt = document.createElement('option');
      opt.value = f.val;
      opt.textContent = f.label;
      selectFormat.appendChild(opt);
    });

    // Audio Quality Options
    const audioQualities = [
      { val: 'best', label: 'Highest Quality (320kbps)' },
      { val: 'high', label: 'High Quality (256kbps)' },
      { val: 'medium', label: 'Medium Quality (128kbps)' },
      { val: 'low', label: 'Low Quality (96kbps)' }
    ];
    audioQualities.forEach(q => {
      const opt = document.createElement('option');
      opt.value = q.val;
      opt.textContent = q.label;
      selectQuality.appendChild(opt);
    });
  }

  // Set defaults from settings if match exists
  if (downloadType === 'video') {
    if (selectQuality.querySelector(`option[value="${globalSettings.videoQuality}"]`)) {
      selectQuality.value = globalSettings.videoQuality;
    }
  } else {
    if (selectFormat.querySelector(`option[value="${globalSettings.audioFormat}"]`)) {
      selectFormat.value = globalSettings.audioFormat;
    }
    if (selectQuality.querySelector(`option[value="${globalSettings.audioQuality}"]`)) {
      selectQuality.value = globalSettings.audioQuality;
    }
  }
}

// Change elements when download type (video vs audio) changes
selectType.addEventListener('change', () => {
  populateFormatsDropdowns(currentMedia && currentMedia.type === 'playlist');
  
  if (selectType.value === 'audio') {
    announceToSR('Download type changed to Audio only. Format and Quality dropdowns updated.');
  } else {
    announceToSR('Download type changed to Video. Format and Quality dropdowns updated.');
  }
});


// --- Advanced Toggles (Inputs) ---

checkPartial.addEventListener('change', () => {
  if (checkPartial.checked) {
    partialTimesRow.classList.remove('hidden');
    inputTimeStart.focus();
    announceToSR('Partial download enabled. Enter start and end times below.');
  } else {
    partialTimesRow.classList.add('hidden');
    announceToSR('Partial download disabled. Whole video will download.');
  }
});

checkSubtitles.addEventListener('change', () => {
  if (checkSubtitles.checked) {
    subtitlesRow.classList.remove('hidden');
    selectSubLang.focus();
    announceToSR('Subtitles enabled. Configure subtitle options below.');
  } else {
    subtitlesRow.classList.add('hidden');
    announceToSR('Subtitles disabled.');
  }
});


// --- Browse Folder Buttons ---

btnBrowseFolder.addEventListener('click', async () => {
  const folder = await window.api.selectFolder();
  if (folder) {
    folderDisplay.value = folder;
    announceToSR(`Save location changed to: ${folder}`);
  }
  btnBrowseFolder.focus();
});

btnSettingsBrowse.addEventListener('click', async () => {
  const folder = await window.api.selectFolder();
  if (folder) {
    settingDefaultFolder.value = folder;
    globalSettings.downloadFolder = folder;
    await window.api.saveSettings(globalSettings);
    announceToSR(`Default download location updated to: ${folder}`);
  }
  btnSettingsBrowse.focus();
});


// --- Playlist selection dialog management ---

let focusReturnElement = null;

btnOpenPlaylistDialog.addEventListener('click', () => {
  if (!currentMedia || currentMedia.type !== 'playlist') return;
  
  // Save focus
  focusReturnElement = btnOpenPlaylistDialog;

  // Render video listing checkboxes
  playlistCheckboxList.innerHTML = '';
  
  currentMedia.entries.forEach((entry) => {
    const isChecked = selectedPlaylistEntries.some(e => e.id === entry.id);
    
    const row = document.createElement('div');
    row.className = 'checkbox-list-item';
    
    const checkCol = document.createElement('div');
    checkCol.className = 'col-check';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.id = `chk-video-${entry.id}`;
    checkbox.checked = isChecked;
    checkbox.className = 'checkbox-input';
    checkbox.setAttribute('data-id', entry.id);
    checkbox.addEventListener('change', updateDialogSelectedCount);
    checkCol.appendChild(checkbox);

    const numCol = document.createElement('div');
    numCol.className = 'col-num';
    numCol.textContent = entry.index;

    const titleCol = document.createElement('div');
    titleCol.className = 'col-title';
    const label = document.createElement('label');
    label.htmlFor = `chk-video-${entry.id}`;
    label.textContent = entry.title;
    titleCol.appendChild(label);

    const durCol = document.createElement('div');
    durCol.className = 'col-duration';
    durCol.textContent = formatDuration(entry.duration);

    row.appendChild(checkCol);
    row.appendChild(numCol);
    row.appendChild(titleCol);
    row.appendChild(durCol);
    playlistCheckboxList.appendChild(row);
  });

  updateDialogSelectedCount();
  dlgPlaylist.showModal();
  
  // Accessibility: focus the select-all button first
  btnSelectAll.focus();
  announceToSR('Playlist selector window opened. Use Tab to move through list and space to check videos.');
});

function updateDialogSelectedCount() {
  const checkboxes = playlistCheckboxList.querySelectorAll('input[type="checkbox"]');
  const checkedCount = Array.from(checkboxes).filter(c => c.checked).length;
  selectedCountMsg.textContent = `${checkedCount} of ${checkboxes.length} videos selected`;
  announceToSR(`${checkedCount} videos selected.`);
}

btnSelectAll.addEventListener('click', () => {
  playlistCheckboxList.querySelectorAll('input[type="checkbox"]').forEach(c => c.checked = true);
  updateDialogSelectedCount();
});

btnSelectNone.addEventListener('click', () => {
  playlistCheckboxList.querySelectorAll('input[type="checkbox"]').forEach(c => c.checked = false);
  updateDialogSelectedCount();
});

btnSelectRange.addEventListener('click', () => {
  const startIdx = parseInt(inputRangeStart.value, 10);
  const endIdx = parseInt(inputRangeEnd.value, 10);

  if (isNaN(startIdx) || isNaN(endIdx) || startIdx < 1 || endIdx < startIdx) {
    announceToSR('Invalid index range. Please enter valid start and end numbers.');
    return;
  }

  const checkboxes = playlistCheckboxList.querySelectorAll('input[type="checkbox"]');
  checkboxes.forEach((c, idx) => {
    const listIndex = idx + 1; // 1-based index
    if (listIndex >= startIdx && listIndex <= endIdx) {
      c.checked = true;
    }
  });

  updateDialogSelectedCount();
  inputRangeStart.value = '';
  inputRangeEnd.value = '';
});

// Close Playlist Dialog
btnCancelPlaylistDlg.addEventListener('click', () => {
  dlgPlaylist.close();
  if (focusReturnElement) {
    focusReturnElement.focus();
  }
});

btnConfirmPlaylistDlg.addEventListener('click', () => {
  const checkboxes = Array.from(playlistCheckboxList.querySelectorAll('input[type="checkbox"]'));
  const checkedIds = checkboxes.filter(c => c.checked).map(c => c.getAttribute('data-id'));
  
  // Map back to full entries
  selectedPlaylistEntries = currentMedia.entries.filter(e => checkedIds.includes(e.id.toString()));

  // Close dialog
  dlgPlaylist.close();

  // Update button/playlist display info
  playlistCount.textContent = selectedPlaylistEntries.length;
  announceToSR(`Confirmed selection. ${selectedPlaylistEntries.length} videos chosen to download.`);
  
  if (focusReturnElement) {
    focusReturnElement.focus();
  }
});


// --- Save Settings from UI Changes ---

function savePanelSettings() {
  globalSettings.videoQuality = settingVideoQuality.value;
  globalSettings.audioFormat = settingAudioFormat.value;
  globalSettings.skipDuplicates = settingDuplicates.checked;
  globalSettings.simultaneousDownloads = parseInt(settingSimultaneous.value, 10);
  globalSettings.autoCheckUpdates = settingAutoUpdates.checked;
  
  window.api.saveSettings(globalSettings);
}

settingVideoQuality.addEventListener('change', savePanelSettings);
settingAudioFormat.addEventListener('change', savePanelSettings);
settingDuplicates.addEventListener('change', savePanelSettings);
settingSimultaneous.addEventListener('change', savePanelSettings);
settingAutoUpdates.addEventListener('change', savePanelSettings);


// --- Execute Downloads (Adding to Queue) ---

btnStartDownload.addEventListener('click', async () => {
  if (!currentMedia) return;

  const downloadFolder = folderDisplay.value.trim();
  const downloadConfig = {
    mode: selectType.value,
    videoQuality: selectQuality.value,
    videoFormat: selectFormat.value,
    audioFormat: selectFormat.value,
    audioQuality: selectQuality.value,
    downloadFolder: downloadFolder,
    
    downloadSubtitles: checkSubtitles.checked,
    subtitleLang: selectSubLang.value,
    subtitleType: selectSubType.value,
    embedSubtitles: checkEmbedSubs.checked,
    
    embedMetadata: checkMetadata.checked,
    embedThumbnail: checkThumbnail.checked,
    
    partialDownload: checkPartial.checked,
    timeStart: inputTimeStart.value.trim(),
    timeEnd: inputTimeEnd.value.trim(),
    
    items: [] // URLs + Titles to download
  };

  // Compile list of items (single video vs playlist selection)
  if (currentMedia.type === 'playlist') {
    if (selectedPlaylistEntries.length === 0) {
      announceToSR('No videos selected in the playlist. Please select videos first.');
      btnOpenPlaylistDialog.focus();
      return;
    }
    
    downloadConfig.items = selectedPlaylistEntries.map(e => ({
      url: e.url,
      title: e.title
    }));
  } else {
    downloadConfig.items = [{
      url: currentMedia.url,
      title: currentMedia.title
    }];
  }

  // Send start command to backend queue
  announceToSR('Adding download to queue...');
  const success = await window.api.startDownload(downloadConfig);

  if (success) {
    announceToSR(`Successfully added ${downloadConfig.items.length} item(s) to the queue.`);
    
    // Automatically switch to the queue tab to show progress
    document.getElementById('tab-queue').click();
    
    // Reset Downloader Card UI
    mediaCard.classList.add('hidden');
    playlistCard.classList.add('hidden');
    inputUrl.value = '';
    currentMedia = null;
    selectedPlaylistEntries = [];
  }
});


// --- Render Download Queue Panel ---

window.api.onQueueUpdate((queue) => {
  activeQueue = queue;
  renderQueue();
});

// Separate progress details updates (low latency streams)
window.api.onDownloadProgress((progress) => {
  const row = document.getElementById(`queue-row-${progress.id}`);
  if (!row) return;

  // Update progress bar
  const pBar = row.querySelector('.progress-bar');
  if (pBar) {
    pBar.style.width = `${progress.percent}%`;
    pBar.setAttribute('aria-valuenow', progress.percent);
  }

  // Update text label percent
  const lblPercent = row.querySelector('.lbl-percent');
  if (lblPercent) lblPercent.textContent = `${progress.percent}%`;

  // Update metadata stats
  const lblStats = row.querySelector('.lbl-stats');
  if (lblStats) {
    lblStats.textContent = `${progress.totalSize} | Speed: ${progress.speed} | ETA: ${progress.eta}`;
  }

  // Update status labels
  const lblStatus = row.querySelector('.progress-status-text');
  if (lblStatus && lblStatus.textContent !== progress.status) {
    lblStatus.textContent = progress.status;
    row.setAttribute('data-status', progress.status);
    
    // Announce state transition changes to Screen Reader
    if (progress.status === 'Completed') {
      const title = row.querySelector('.queue-title').textContent;
      announceToSR(`Download completed: ${title}`);
      loadHistory(); // Reload history
    }
  }
});

// Status messages like mergers/FFmpeg
window.api.onDownloadStatus((data) => {
  const row = document.getElementById(`queue-row-${data.id}`);
  if (!row) return;

  const lblStats = row.querySelector('.lbl-stats');
  if (lblStats) {
    lblStats.textContent = data.message;
  }
});

function renderQueue() {
  const activeDownloads = activeQueue.filter(item => item.status === 'Downloading' || item.status === 'Waiting').length;
  
  // Badge numbers
  if (activeDownloads > 0) {
    queueBadge.textContent = activeDownloads;
    queueBadge.classList.remove('hidden');
    queueBadge.setAttribute('aria-label', `${activeDownloads} downloads active`);
  } else {
    queueBadge.classList.add('hidden');
  }

  if (activeQueue.length === 0) {
    queueEmptyState.classList.remove('hidden');
    queueList.classList.add('hidden');
    return;
  }

  queueEmptyState.classList.add('hidden');
  queueList.classList.remove('hidden');

  // Maintain list items without rebuilding entire DOM (which breaks scroll/focus positions!)
  const existingRows = Array.from(queueList.querySelectorAll('.queue-item'));
  const targetIds = activeQueue.map(item => item.id);

  // Remove rows no longer in queue
  existingRows.forEach(row => {
    const rowId = row.id.replace('queue-row-', '');
    if (!targetIds.includes(rowId)) {
      row.remove();
    }
  });

  // Re-render or create rows
  activeQueue.forEach((item, index) => {
    let row = document.getElementById(`queue-row-${item.id}`);
    
    if (!row) {
      // Create new card element
      row = document.createElement('div');
      row.id = `queue-row-${item.id}`;
      row.className = 'queue-item';
      queueList.appendChild(row);
    }

    row.setAttribute('data-status', item.status);
    
    // Check if error box is needed
    const errorHTML = item.error ? `<div class="error-text-block" role="alert">Error: ${item.error}</div>` : '';

    // Action buttons depending on state
    let actionsHTML = '';
    if (item.status === 'Downloading' || item.status === 'Waiting') {
      actionsHTML = `<button class="btn btn-secondary btn-sm btn-pause" aria-label="Pause download of ${item.title}">Pause</button>`;
    } else if (item.status === 'Paused') {
      actionsHTML = `<button class="btn btn-primary btn-sm btn-resume" aria-label="Resume download of ${item.title}">Resume</button>`;
    } else if (item.status === 'Failed' || item.status === 'Cancelled') {
      actionsHTML = `<button class="btn btn-primary btn-sm btn-retry" aria-label="Retry download of ${item.title}">Retry</button>`;
    }

    // Add generic remove button
    actionsHTML += `<button class="btn btn-secondary btn-sm btn-remove" aria-label="Remove ${item.title} from queue">Remove</button>`;

    row.innerHTML = `
      <div class="queue-item-header">
        <span class="queue-title" title="${item.title}">${item.title}</span>
        <span class="queue-meta-label">${item.qualityLabel}</span>
      </div>
      
      <div class="progress-container">
        <div class="progress-bar-bg">
          <div class="progress-bar" style="width: ${item.percent}%" role="progressbar" aria-valuenow="${item.percent}" aria-valuemin="0" aria-valuemax="100"></div>
        </div>
        <div class="progress-info">
          <span class="progress-status-text">${item.status}</span>
          <span class="lbl-percent">${item.percent}%</span>
          <span class="lbl-stats">${item.totalSize} | ETA: ${item.eta}</span>
        </div>
      </div>
      ${errorHTML}
      <div class="queue-item-actions">
        ${actionsHTML}
      </div>
    `;

    // Hook listeners
    row.querySelector('.btn-remove').addEventListener('click', () => {
      announceToSR(`Removing ${item.title} from queue.`);
      window.api.removeDownload(item.id);
    });

    const btnPause = row.querySelector('.btn-pause');
    if (btnPause) {
      btnPause.addEventListener('click', () => {
        announceToSR(`Pausing ${item.title}.`);
        window.api.pauseDownload(item.id);
      });
    }

    const btnResume = row.querySelector('.btn-resume');
    if (btnResume) {
      btnResume.addEventListener('click', () => {
        announceToSR(`Resuming ${item.title}.`);
        window.api.retryDownload(item.id);
      });
    }

    const btnRetry = row.querySelector('.btn-retry');
    if (btnRetry) {
      btnRetry.addEventListener('click', () => {
        announceToSR(`Retrying ${item.title}.`);
        window.api.retryDownload(item.id);
      });
    }
  });
}

btnClearCompleted.addEventListener('click', () => {
  announceToSR('Clearing completed items.');
  activeQueue.forEach(item => {
    if (item.status === 'Completed') window.api.removeDownload(item.id);
  });
});

btnClearFailed.addEventListener('click', () => {
  announceToSR('Clearing failed items.');
  activeQueue.forEach(item => {
    if (item.status === 'Failed' || item.status === 'Cancelled') window.api.removeDownload(item.id);
  });
});


// --- History Panel ---

async function loadHistory() {
  const history = await window.api.getDownloadHistory();
  renderHistory(history);
}

function renderHistory(items) {
  const filter = inputSearchHistory.value.toLowerCase().trim();
  const filtered = items.filter(item => {
    return item.title.toLowerCase().includes(filter) || 
           item.format.toLowerCase().includes(filter) ||
           item.status.toLowerCase().includes(filter);
  });

  if (filtered.length === 0) {
    historyEmptyState.classList.remove('hidden');
    historyTableContainer.classList.add('hidden');
    return;
  }

  historyEmptyState.classList.add('hidden');
  historyTableContainer.classList.remove('hidden');

  historyList.innerHTML = '';
  filtered.forEach((item) => {
    const tr = document.createElement('tr');
    
    const tdDate = document.createElement('td');
    tdDate.textContent = item.date;

    const tdTitle = document.createElement('td');
    tdTitle.textContent = item.title;
    tdTitle.setAttribute('title', item.title);

    const tdFormat = document.createElement('td');
    tdFormat.textContent = item.format.toUpperCase();

    const tdStatus = document.createElement('td');
    tdStatus.textContent = item.status;
    if (item.status.includes('Completed')) {
      tdStatus.style.color = 'var(--color-success)';
    } else {
      tdStatus.style.color = 'var(--color-error)';
    }

    const tdActions = document.createElement('td');
    tdActions.className = 'actions-col';
    
    // Only show folders if download completed
    if (item.status.includes('Completed') && item.location) {
      const btnOpen = document.createElement('button');
      btnOpen.className = 'btn btn-secondary btn-sm';
      btnOpen.textContent = 'Show in Folder';
      btnOpen.setAttribute('aria-label', `Open file folder containing ${item.title}`);
      btnOpen.addEventListener('click', () => {
        // location is full file path, extract directory
        const dir = item.location.substring(0, item.location.lastIndexOf('\\'));
        window.api.openDownloadFolder(dir);
      });
      tdActions.appendChild(btnOpen);
    }

    tr.appendChild(tdDate);
    tr.appendChild(tdTitle);
    tr.appendChild(tdFormat);
    tr.appendChild(tdStatus);
    tr.appendChild(tdActions);
    historyList.appendChild(tr);
  });
}

inputSearchHistory.addEventListener('input', () => {
  loadHistory();
});

btnClearHistory.addEventListener('click', async () => {
  const confirmed = confirm('Are you sure you want to clear the entire download history?');
  if (confirmed) {
    await window.api.clearHistory();
    announceToSR('Download history cleared.');
    loadHistory();
  }
});


// --- Settings Panel Actions ---

btnCheckYtdlp.addEventListener('click', async () => {
  btnCheckYtdlp.disabled = true;
  announceToSR('Checking for yt-dlp downloader engine updates...');
  
  const result = await window.api.checkEngineUpdates();
  btnCheckYtdlp.disabled = false;

  if (result.error) {
    showInfoModal('Update Check Failed', `Could not check for updates: ${result.error}`);
    announceToSR(`Update check failed. ${result.error}`);
  } else if (result.updateAvailable) {
    // Show Yes/No modal
    updateCurrentVer.textContent = `Installed version: ${result.current}`;
    updateLatestVer.textContent = `Newest version: ${result.latest}`;
    dlgUpdate.showModal();
    announceToSR(`Update is available. Current version is ${result.current}, latest is ${result.latest}.`);
  } else {
    showInfoModal('Engine Up To Date', `The yt-dlp engine is already up to date!\nInstalled version: ${result.current}`);
    announceToSR(`Downloader engine is up to date. Installed version is ${result.current}.`);
  }
});

btnInstallFfmpeg.addEventListener('click', async () => {
  btnInstallFfmpeg.disabled = true;
  announceToSR('Starting download of FFmpeg for Windows. This might take a few minutes depending on your internet connection...');
  
  await window.api.downloadFFmpeg();
  btnInstallFfmpeg.disabled = false;
});

// Update Dialog Consent handles
btnUpdateYes.addEventListener('click', async () => {
  dlgUpdate.close();
  announceToSR('Updating engine. Please wait...');
  await window.api.updateEngine();
});

btnUpdateNo.addEventListener('click', () => {
  dlgUpdate.close();
  announceToSR('Update cancelled by user.');
});

// Info Close Handler
btnInfoClose.addEventListener('click', () => {
  dlgInfo.close();
});


// --- Keyboard Shortcuts (Global listeners) ---

document.addEventListener('keydown', (e) => {
  // Focus Link Input (Ctrl + N)
  if (e.ctrlKey && e.key.toLowerCase() === 'n') {
    // Switch to Downloader tab
    document.getElementById('tab-downloader').click();
    inputUrl.value = '';
    inputUrl.focus();
    announceToSR('New download: Pasting link field focused.');
    e.preventDefault();
  }

  // Start Download (Ctrl + Enter in main card config)
  if (e.ctrlKey && e.key === 'Enter') {
    if (currentMedia && mediaCard.classList.contains('hidden') === false) {
      btnStartDownload.click();
      e.preventDefault();
    }
  }

  // Switch tabs using Alt + 1, 2, 3, 4
  if (e.altKey && ['1', '2', '3', '4'].includes(e.key)) {
    const idx = parseInt(e.key, 10) - 1;
    if (tabButtons[idx]) {
      tabButtons[idx].click();
      tabButtons[idx].focus();
      e.preventDefault();
    }
  }

  // Switch tabs using Ctrl + 1, 2, 3, 4, 5
  if (e.ctrlKey && ['1', '2', '3', '4', '5'].includes(e.key)) {
    const idx = Math.min(parseInt(e.key, 10) - 1, tabButtons.length - 1);
    if (tabButtons[idx]) {
      tabButtons[idx].click();
      tabButtons[idx].focus();
      e.preventDefault();
    }
  }
});


// Launch
window.addEventListener('DOMContentLoaded', initApp);
