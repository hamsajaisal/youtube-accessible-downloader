const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const engine = require('./engine');

// Helper to parse duration string (like "10:35" or "02:15:30") into seconds
function durationToSeconds(durStr) {
  if (!durStr) return 0;
  const parts = durStr.split(':').map(Number);
  if (parts.some(isNaN)) return 0;
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  } else if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  } else if (parts.length === 1) {
    return parts[0];
  }
  return 0;
}

// Get metadata of a URL (flat playlist or full single video)
function getUrlInfo(url) {
  return new Promise((resolve, reject) => {
    const { ytDlpPath } = engine.getPaths();
    if (!fs.existsSync(ytDlpPath)) {
      reject(new Error('yt-dlp engine is not installed. Please check updates.'));
      return;
    }

    // Run with --dump-json and --flat-playlist to scan quickly
    const args = ['--dump-json', '--flat-playlist', url];
    const child = spawn(ytDlpPath, args);
    
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(stderr.trim() || `yt-dlp exited with code ${code}`));
        return;
      }

      try {
        const lines = stdout.trim().split('\n').filter(l => l.trim() !== '');
        
        if (lines.length === 0) {
          reject(new Error('No information returned from URL.'));
          return;
        }

        // If there are multiple lines, it's likely a playlist or channel listing
        if (lines.length > 1 || (lines.length === 1 && JSON.parse(lines[0])._type === 'playlist')) {
          // Parse as playlist
          // The first line might be the playlist info, or we aggregate individual entries
          const entries = [];
          let playlistTitle = 'YouTube Playlist';
          let playlistId = '';
          let uploader = '';

          for (const line of lines) {
            const parsed = JSON.parse(line);
            if (parsed._type === 'playlist') {
              playlistTitle = parsed.title || playlistTitle;
              playlistId = parsed.id || playlistId;
              uploader = parsed.uploader || uploader;
              if (parsed.entries) {
                entries.push(...parsed.entries.map((e, idx) => ({
                  id: e.id || e.url,
                  url: e.url || `https://www.youtube.com/watch?v=${e.id}`,
                  title: e.title || `Video #${idx + 1}`,
                  duration: e.duration || 0,
                  index: idx + 1
                })));
              }
            } else {
              // Flat playlist mode prints entries one per line
              entries.push({
                id: parsed.id,
                url: parsed.url || `https://www.youtube.com/watch?v=${parsed.id}`,
                title: parsed.title || `Video #${parsed.playlist_index || entries.length + 1}`,
                duration: parsed.duration || 0,
                index: parsed.playlist_index || entries.length + 1
              });
            }
          }

          resolve({
            type: 'playlist',
            title: playlistTitle,
            id: playlistId,
            uploader: uploader,
            videoCount: entries.length,
            entries: entries
          });
        } else {
          // Single video detailed parse
          const parsed = JSON.parse(lines[0]);
          
          // Parse subtitles
          const subtitles = [];
          if (parsed.subtitles) {
            for (const lang of Object.keys(parsed.subtitles)) {
              subtitles.push({ code: lang, name: lang, isAuto: false });
            }
          }
          if (parsed.automatic_captions) {
            for (const lang of Object.keys(parsed.automatic_captions)) {
              subtitles.push({ code: lang, name: `${lang} (Auto)`, isAuto: true });
            }
          }

          // Parse and simplify formats
          const videoFormats = [];
          const audioFormats = [];

          if (parsed.formats) {
            parsed.formats.forEach((f) => {
              const isVideo = f.vcodec && f.vcodec !== 'none';
              const isAudio = f.acodec && f.acodec !== 'none';
              const width = f.width || 0;
              const height = f.height || 0;
              const ext = f.ext || '';
              const formatId = f.format_id || '';
              const size = f.filesize || f.filesize_approx || null;

              if (isVideo) {
                // Group video by standard heights
                videoFormats.push({
                  formatId,
                  ext,
                  height,
                  width,
                  fps: f.fps || 30,
                  qualityLabel: `${height}p` + (f.fps > 30 ? f.fps : ''),
                  size,
                  isMerged: isAudio,
                  vcodec: f.vcodec,
                  acodec: f.acodec
                });
              } else if (isAudio) {
                audioFormats.push({
                  formatId,
                  ext,
                  abr: f.abr || 0,
                  qualityLabel: f.abr ? `${Math.round(f.abr)}kbps` : 'Audio',
                  size,
                  acodec: f.acodec
                });
              }
            });
          }

          // Sort formats
          videoFormats.sort((a, b) => b.height - a.height);
          audioFormats.sort((a, b) => b.abr - a.abr);

          resolve({
            type: 'video',
            id: parsed.id,
            url: parsed.webpage_url || url,
            title: parsed.title,
            duration: parsed.duration || 0,
            uploader: parsed.uploader,
            uploadDate: parsed.upload_date,
            thumbnail: parsed.thumbnail,
            description: parsed.description,
            subtitles: subtitles,
            videoFormats: videoFormats,
            audioFormats: audioFormats
          });
        }
      } catch (err) {
        reject(new Error(`Failed to parse response: ${err.message}`));
      }
    });
  });
}

// Download a single item, spawning a process
function runDownloadProcess(url, config, onProgress, onStatus) {
  const { ytDlpPath, ffmpegPath } = engine.getPaths();
  const args = [];

  // 1. Target URL
  args.push(url);

  // 2. FFmpeg Location
  if (fs.existsSync(ffmpegPath)) {
    args.push('--ffmpeg-location', engine.getPaths().binDir);
  }

  // 3. Format selection
  if (config.mode === 'audio') {
    args.push('-f', 'bestaudio/best');
    args.push('--extract-audio');
    
    // Choose audio format and quality
    const audioFmt = config.audioFormat || 'mp3';
    args.push('--audio-format', audioFmt);
    
    let audioQuality = '5'; // default medium (128k approx)
    if (config.audioQuality === 'best') audioQuality = '0'; // highest (320k)
    else if (config.audioQuality === 'high') audioQuality = '2'; // high (256k)
    else if (config.audioQuality === 'medium') audioQuality = '5';
    else if (config.audioQuality === 'low') audioQuality = '9'; // low (96k)
    
    args.push('--audio-quality', audioQuality);
  } else {
    // Video mode
    let formatStr = 'bestvideo+bestaudio/best';
    if (config.videoQuality) {
      if (config.videoQuality === 'best') {
        formatStr = 'bestvideo+bestaudio/best';
      } else {
        const height = parseInt(config.videoQuality, 10);
        if (!isNaN(height)) {
          // Select best video up to selected height, merge with best audio
          formatStr = `bestvideo[height<=${height}]+bestaudio/best`;
        }
      }
    }
    args.push('-f', formatStr);
    
    // Merge format (usually mp4 or mkv)
    args.push('--merge-output-format', config.videoFormat || 'mp4');
  }

  // 4. Subtitles
  if (config.downloadSubtitles) {
    if (config.subtitleType === 'auto') {
      args.push('--write-auto-subs');
    } else {
      args.push('--write-subs');
    }
    
    if (config.subtitleLang) {
      args.push('--sub-langs', config.subtitleLang);
    } else {
      args.push('--sub-langs', 'all');
    }

    if (config.embedSubtitles && config.mode !== 'audio') {
      args.push('--embed-subs');
    }
  }

  // 5. Metadata and Thumbnail Embedding
  if (config.embedMetadata) {
    args.push('--embed-metadata');
  }
  if (config.embedThumbnail) {
    args.push('--embed-thumbnail');
  }

  // 6. Section download (Partial cutting)
  if (config.partialDownload && config.timeStart && config.timeEnd) {
    // Format: *00:10:30-00:25:45
    const sectionStr = `*${config.timeStart}-${config.timeEnd}`;
    args.push('--download-sections', sectionStr);
  }

  // 7. Output directory and naming template
  const outDir = config.downloadFolder || path.join(require('os').homedir(), 'Downloads');
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  // Set file naming template (removes invalid windows characters automatically)
  // yt-dlp replaces invalid characters with underscores or similar safe symbols
  const outputTemplate = path.join(outDir, '%(title)s.%(ext)s');
  args.push('-o', outputTemplate);

  // 8. Queue / Resume support
  args.push('--no-playlist'); // Download single video even if URL belongs to a playlist
  args.push('--newline'); // Print progress status on newlines

  // 9. Skip duplicate check
  if (config.skipDuplicates) {
    args.push('--no-overwrites');
  } else {
    args.push('--yes-overwrites');
  }

  onStatus('Starting download process...');

  const child = spawn(ytDlpPath, args);
  
  // Progress regex
  // Matches: [download]  12.4% of   50.12MiB at    1.50MiB/s ETA 00:25
  const progressRegex = /\[download\]\s+(\d+(?:\.\d+)?)%\s+of\s+([~\d\.]+\w+)\s+at\s+([\d\.]+\w+\/s|Unknown\s+speed)\s+ETA\s+([\d:]+|Unknown\s+ETA)/i;
  const ffmpegRegex = /\[ffmpeg\].*?(?:merging|converting|extracting)/i;

  child.stdout.on('data', (data) => {
    const lines = data.toString().split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      // Check download progress
      const match = trimmed.match(progressRegex);
      if (match) {
        const percent = parseFloat(match[1]);
        const size = match[2];
        const speed = match[3];
        const eta = match[4];

        onProgress({
          percent,
          totalSize: size,
          speed,
          eta,
          status: 'Downloading'
        });
      } else if (trimmed.startsWith('[Merger]')) {
        onStatus('Merging video and audio streams...');
        onProgress({ percent: 95, status: 'Merging streams' });
      } else if (trimmed.startsWith('[ExtractAudio]')) {
        onStatus('Extracting audio track...');
        onProgress({ percent: 95, status: 'Extracting audio' });
      } else if (trimmed.startsWith('[VideoConvertor]')) {
        onStatus('Converting video format...');
        onProgress({ percent: 98, status: 'Converting' });
      } else if (ffmpegRegex.test(trimmed)) {
        onStatus('Processing with FFmpeg...');
      }
    }
  });

  let stderrOutput = '';
  child.stderr.on('data', (data) => {
    stderrOutput += data.toString();
  });

  return new Promise((resolve, reject) => {
    child.on('close', (code) => {
      if (code === 0) {
        onProgress({ percent: 100, status: 'Completed' });
        resolve();
      } else {
        const errText = stderrOutput.trim();
        // Give a user-friendly error description if possible
        let friendlyError = 'Download failed.';
        if (errText.includes('HTTP Error 403')) {
          friendlyError = 'Access denied (HTTP 403). The video might be restricted, or YouTube is blocking requests temporarily. Please check if yt-dlp has an update.';
        } else if (errText.includes('HTTP Error 404')) {
          friendlyError = 'Video not found. Please verify the URL.';
        } else if (errText.includes('Sign in to confirm your age')) {
          friendlyError = 'This video is age-restricted and requires logging in, which is not supported to protect your account safety.';
        } else if (errText.includes('Private video')) {
          friendlyError = 'This is a private video. Private videos cannot be downloaded.';
        } else if (errText.includes('Requested format is not available')) {
          friendlyError = 'The selected resolution or format is not available for this video.';
        } else if (errText) {
          friendlyError = errText;
        }
        reject(new Error(friendlyError));
      }
    });

    // Provide a handle to cancel the download
    config.cancelToken.cancel = () => {
      child.kill('SIGINT');
      reject(new Error('Cancelled by user'));
    };
  });
}

module.exports = {
  getUrlInfo,
  runDownloadProcess,
  durationToSeconds
};
