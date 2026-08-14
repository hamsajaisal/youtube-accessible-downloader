const fs = require('fs');
const path = require('path');
const https = require('https');
const { exec } = require('child_process');

// Paths to binaries
let binDir = '';
let ytDlpPath = '';
let ffmpegPath = '';

function initPaths(appUserDataPath) {
  binDir = path.join(appUserDataPath, 'bin');
  if (!fs.existsSync(binDir)) {
    fs.mkdirSync(binDir, { recursive: true });
  }
  ytDlpPath = path.join(binDir, 'yt-dlp.exe');
  ffmpegPath = path.join(binDir, 'ffmpeg.exe');
}

function getPaths() {
  return { binDir, ytDlpPath, ffmpegPath };
}

// Download a file handling redirects and reporting progress
function downloadFile(url, destPath, onProgress) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);
    
    const request = (targetUrl) => {
      https.get(targetUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) youtube-downloader' }
      }, (response) => {
        // Handle redirect
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          file.close();
          // Re-open file to overwrite
          fs.unlink(destPath, () => {
            downloadFile(response.headers.location, destPath, onProgress)
              .then(resolve)
              .catch(reject);
          });
          return;
        }

        if (response.statusCode !== 200) {
          reject(new Error(`Failed to download: Status Code ${response.statusCode}`));
          return;
        }

        const totalBytes = parseInt(response.headers['content-length'], 10);
        let downloadedBytes = 0;

        response.pipe(file);

        response.on('data', (chunk) => {
          downloadedBytes += chunk.length;
          if (onProgress && totalBytes) {
            const percent = Math.round((downloadedBytes / totalBytes) * 100);
            onProgress(percent);
          }
        });

        file.on('finish', () => {
          file.close(() => resolve(destPath));
        });
      }).on('error', (err) => {
        fs.unlink(destPath, () => {});
        reject(err);
      });
    };

    request(url);
  });
}

// Unzip using Windows native PowerShell (no npm package required)
function unzipWindows(zipPath, destDir) {
  return new Promise((resolve, reject) => {
    const cmd = `powershell -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${destDir}' -Force"`;
    exec(cmd, (error, stdout, stderr) => {
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
  });
}

// Check if engines are installed
function checkEngines() {
  return {
    ytDlpExists: fs.existsSync(ytDlpPath),
    ffmpegExists: fs.existsSync(ffmpegPath)
  };
}

// Download FFmpeg
async function downloadFFmpeg(onProgress) {
  const zipPath = path.join(binDir, 'ffmpeg.zip');
  const url = 'https://github.com/ffbinaries/ffbinaries-prebuilt/releases/download/v4.4.1/ffmpeg-4.4.1-win-64.zip';
  
  onProgress(5); // Start progress
  await downloadFile(url, zipPath, (p) => {
    // Scale progress to 0-80% for download
    onProgress(Math.round(5 + p * 0.75));
  });

  onProgress(85); // Extract progress
  await unzipWindows(zipPath, binDir);
  
  // Cleanup zip
  try {
    fs.unlinkSync(zipPath);
  } catch (e) {}

  onProgress(100);
  return ffmpegPath;
}

// Download yt-dlp
async function downloadYtDlp(onProgress) {
  const url = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe';
  await downloadFile(url, ytDlpPath, onProgress);
  return ytDlpPath;
}

// Get version of local yt-dlp.exe
function getLocalYtDlpVersion() {
  return new Promise((resolve) => {
    if (!fs.existsSync(ytDlpPath)) {
      resolve(null);
      return;
    }
    exec(`"${ytDlpPath}" --version`, (error, stdout) => {
      if (error) {
        resolve(null);
      } else {
        resolve(stdout.trim());
      }
    });
  });
}

// Fetch latest version info from GitHub API
function getLatestYtDlpVersion() {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.github.com',
      path: '/repos/yt-dlp/yt-dlp/releases/latest',
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) youtube-downloader' }
    };

    https.get(options, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`Failed to fetch release info: Code ${res.statusCode}`));
        return;
      }
      
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve(json.tag_name); // typically something like "2026.08.01"
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

// Check for updates
async function checkYtDlpUpdate() {
  const current = await getLocalYtDlpVersion();
  if (!current) {
    return { updateAvailable: true, current: 'Not installed', latest: 'Latest' };
  }
  
  try {
    let latest = await getLatestYtDlpVersion();
    // tag_name might include 'v' (e.g. v2026.08.01), strip it if necessary
    const cleanedLatest = latest.startsWith('v') ? latest.substring(1) : latest;
    const cleanedCurrent = current.startsWith('v') ? current.substring(1) : current;

    return {
      updateAvailable: cleanedCurrent !== cleanedLatest,
      current: cleanedCurrent,
      latest: cleanedLatest
    };
  } catch (err) {
    console.error('Failed to check yt-dlp updates:', err);
    return { updateAvailable: false, error: err.message, current };
  }
}

module.exports = {
  initPaths,
  getPaths,
  checkEngines,
  downloadFFmpeg,
  downloadYtDlp,
  checkYtDlpUpdate,
  getLocalYtDlpVersion
};
