using System;
using System.Collections.ObjectModel;
using System.ComponentModel;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using System.Windows;

namespace YoutubeDownloader
{
    public class DownloadConfig
    {
        public string Mode { get; set; } = "video"; // "video" or "audio"
        public string VideoQuality { get; set; } = "best";
        public string VideoFormat { get; set; } = "mp4";
        public string AudioFormat { get; set; } = "mp3";
        public string AudioQuality { get; set; } = "best";
        public string DownloadFolder { get; set; } = string.Empty;
        public bool DownloadSubtitles { get; set; } = false;
        public string SubtitleLang { get; set; } = "en";
        public string SubtitleType { get; set; } = "manual";
        public bool EmbedSubtitles { get; set; } = false;
        public bool EmbedMetadata { get; set; } = true;
        public bool EmbedThumbnail { get; set; } = true;
        public bool PartialDownload { get; set; } = false;
        public string TimeStart { get; set; } = string.Empty;
        public string TimeEnd { get; set; } = string.Empty;
    }

    public class DownloadItem : INotifyPropertyChanged
    {
        private string _status = "Waiting";
        private int _percent = 0;
        private string _speed = "0 KB/s";
        private string _eta = "--:--";
        private string _totalSize = "--";
        private string _error = string.Empty;

        public string Id { get; set; } = Guid.NewGuid().ToString();
        public string Url { get; set; } = string.Empty;
        public string Title { get; set; } = string.Empty;
        public string QualityLabel { get; set; } = string.Empty;
        public DownloadConfig Config { get; set; } = new DownloadConfig();
        
        [System.Text.Json.Serialization.JsonIgnore]
        public Process? Process { get; set; }

        public string Status
        {
            get => _status;
            set { _status = value; OnPropertyChanged(nameof(Status)); }
        }

        public int Percent
        {
            get => _percent;
            set { _percent = value; OnPropertyChanged(nameof(Percent)); }
        }

        public string Speed
        {
            get => _speed;
            set { _speed = value; OnPropertyChanged(nameof(Speed)); }
        }

        public string Eta
        {
            get => _eta;
            set { _eta = value; OnPropertyChanged(nameof(Eta)); }
        }

        public string TotalSize
        {
            get => _totalSize;
            set { _totalSize = value; OnPropertyChanged(nameof(TotalSize)); }
        }

        public string Error
        {
            get => _error;
            set 
            { 
                _error = value; 
                OnPropertyChanged(nameof(Error)); 
                OnPropertyChanged(nameof(HasError)); 
            }
        }

        public bool HasError => !string.IsNullOrEmpty(Error);

        public event PropertyChangedEventHandler? PropertyChanged;
        protected void OnPropertyChanged(string name) => PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(name));
    }

    public static class DownloadManager
    {
        public static ObservableCollection<DownloadItem> Queue { get; } = new ObservableCollection<DownloadItem>();
        private static bool _isProcessing = false;

        public static void AddToQueue(string url, string title, string qualityLabel, DownloadConfig config)
        {
            var item = new DownloadItem
            {
                Url = url,
                Title = title,
                QualityLabel = qualityLabel,
                Config = config
            };

            Application.Current.Dispatcher.Invoke(() => Queue.Add(item));
            
            // Start queue processor
            _ = ProcessQueue();
        }

        public static async Task ProcessQueue()
        {
            if (_isProcessing) return;
            _isProcessing = true;

            try
            {
                while (true)
                {
                    // Find active downloads count
                    int activeCount = Queue.Count(i => i.Status == "Downloading");
                    int maxConcurrent = SettingsManager.Current.SimultaneousDownloads;

                    if (activeCount >= maxConcurrent)
                    {
                        await Task.Delay(1000);
                        continue;
                    }

                    // Find next waiting item
                    var nextItem = Queue.FirstOrDefault(i => i.Status == "Waiting");
                    if (nextItem == null)
                    {
                        // No items waiting, break
                        break;
                    }

                    // Start downloading
                    _ = RunDownload(nextItem);
                }
            }
            finally
            {
                _isProcessing = false;
            }
        }

        private static async Task RunDownload(DownloadItem item)
        {
            item.Status = "Downloading";
            item.Percent = 0;
            item.Speed = "0 KB/s";
            item.Eta = "Starting...";

            await Task.Run(() =>
            {
                try
                {
                    // Build arguments
                    string args = BuildArguments(item);
                    
                    item.Process = new Process();
                    item.Process.StartInfo.FileName = EngineManager.YtDlpPath;
                    item.Process.StartInfo.Arguments = args;
                    item.Process.StartInfo.UseShellExecute = false;
                    item.Process.StartInfo.RedirectStandardOutput = true;
                    item.Process.StartInfo.RedirectStandardError = true;
                    item.Process.StartInfo.CreateNoWindow = true;
                    
                    // Set environment path to locate ffmpeg
                    if (EngineManager.FfmpegExists)
                    {
                        string currentPath = Environment.GetEnvironmentVariable("PATH") ?? "";
                        if (!currentPath.Contains(EngineManager.BinFolder))
                        {
                            Environment.SetEnvironmentVariable("PATH", currentPath + Path.PathSeparator + EngineManager.BinFolder);
                        }
                        item.Process.StartInfo.EnvironmentVariables["PATH"] = Environment.GetEnvironmentVariable("PATH");
                    }

                    item.Process.OutputDataReceived += (sender, e) =>
                    {
                        if (e.Data != null)
                        {
                            ParseProgress(item, e.Data);
                        }
                    };

                    item.Process.ErrorDataReceived += (sender, e) =>
                    {
                        if (!string.IsNullOrEmpty(e.Data))
                        {
                            // Filter warnings
                            if (!e.Data.StartsWith("WARNING:", StringComparison.OrdinalIgnoreCase))
                            {
                                item.Error = e.Data;
                            }
                        }
                    };

                    item.Process.Start();
                    item.Process.BeginOutputReadLine();
                    item.Process.BeginErrorReadLine();

                    item.Process.WaitForExit();

                    int exitCode = item.Process.ExitCode;

                    if (item.Status == "Downloading")
                    {
                        if (exitCode == 0)
                        {
                            item.Status = "Completed";
                            item.Percent = 100;
                            item.Speed = "--";
                            item.Eta = "Done";
                            HistoryManager.Add(item.Title, item.Config.Mode == "audio" ? item.Config.AudioFormat : item.Config.VideoFormat, "Completed", item.Config.DownloadFolder);
                        }
                        else
                        {
                            item.Status = "Failed";
                            item.Error = string.IsNullOrEmpty(item.Error) ? $"Exit code {exitCode}" : item.Error;
                            HistoryManager.Add(item.Title, item.Config.Mode == "audio" ? item.Config.AudioFormat : item.Config.VideoFormat, $"Failed: {item.Error}", item.Config.DownloadFolder);
                        }
                    }
                }
                catch (Exception ex)
                {
                    item.Status = "Failed";
                    item.Error = ex.Message;
                    HistoryManager.Add(item.Title, item.Config.Mode == "audio" ? item.Config.AudioFormat : item.Config.VideoFormat, $"Failed: {ex.Message}", item.Config.DownloadFolder);
                }
            });

            // Re-trigger queue process to start any waiting items
            _ = ProcessQueue();
        }

        private static string BuildArguments(DownloadItem item)
        {
            var config = item.Config;
            string args = $"\"{item.Url}\"";

            // Download folder and file name formatting
            string outputPath = Path.Combine(config.DownloadFolder, "%(title)s.%(ext)s");
            args += $" -o \"{outputPath}\"";

            // Check duplicates
            if (SettingsManager.Current.SkipDuplicates)
            {
                args += " --no-overwrites";
            }

            // Mode: Video vs Audio
            if (config.Mode == "audio")
            {
                args += " -x";
                args += $" --audio-format {config.AudioFormat}";
                args += $" --audio-quality {(config.AudioQuality == "best" ? "0" : config.AudioQuality == "high" ? "3" : config.AudioQuality == "medium" ? "5" : "7")}";
            }
            else
            {
                // Video Format and Quality
                if (config.VideoQuality == "best")
                {
                    args += $" -f \"bestvideo[ext={config.VideoFormat}]+bestaudio/best\"";
                }
                else
                {
                    // Select specified height or lower
                    args += $" -f \"bestvideo[height<={config.VideoQuality}][ext={config.VideoFormat}]+bestaudio/best\"";
                }

                // Subtitles
                if (config.DownloadSubtitles)
                {
                    args += " --write-subs";
                    if (config.SubtitleType == "auto")
                    {
                        args += " --write-auto-subs";
                    }
                    args += $" --sub-langs \"{config.SubtitleLang}\"";

                    if (config.EmbedSubtitles)
                    {
                        args += " --embed-subs";
                    }
                }
            }

            // Metadata & Thumbnail
            if (config.EmbedMetadata)
            {
                args += " --embed-metadata";
            }

            if (config.EmbedThumbnail)
            {
                args += " --embed-thumbnail";
            }

            // Partial downloading
            if (config.PartialDownload)
            {
                string start = string.IsNullOrEmpty(config.TimeStart) ? "00:00:00" : config.TimeStart;
                string end = string.IsNullOrEmpty(config.TimeEnd) ? "99:59:59" : config.TimeEnd;
                args += $" --download-sections \"*{start}-{end}\"";
            }

            // FFmpeg location path override
            if (EngineManager.FfmpegExists)
            {
                args += $" --ffmpeg-location \"{EngineManager.BinFolder}\"";
            }

            return args;
        }

        private static readonly Regex ProgressRegex = new Regex(@"\[download\]\s+(\d+(?:\.\d+)?)%\s+of\s+(~?\d+(?:\.\d+)?\w+)\s+at\s+(\d+(?:\.\d+)?\w+/s)\s+ETA\s+(\d+:\d+)", RegexOptions.Compiled);

        private static void ParseProgress(DownloadItem item, string line)
        {
            try
            {
                var match = ProgressRegex.Match(line);
                if (match.Success)
                {
                    if (double.TryParse(match.Groups[1].Value, out double pct))
                    {
                        item.Percent = (int)pct;
                    }
                    item.TotalSize = match.Groups[2].Value;
                    item.Speed = match.Groups[3].Value;
                    item.Eta = match.Groups[4].Value;
                }
                else if (line.Contains("[download] 100%"))
                {
                    item.Percent = 100;
                    item.Speed = "--";
                    item.Eta = "Processing...";
                }
                else if (line.Contains("[Merger]") || line.Contains("[ExtractAudio]"))
                {
                    item.Percent = 100;
                    item.Speed = "--";
                    item.Eta = "Merging formats...";
                }
            }
            catch
            {
                // Fallback for parsing anomalies
            }
        }

        public static void PauseDownload(string id)
        {
            var item = Queue.FirstOrDefault(i => i.Id == id);
            if (item != null && item.Status == "Downloading" && item.Process != null)
            {
                try
                {
                    // Kill process safely to cancel/pause
                    item.Process.Kill();
                    item.Status = "Paused";
                    item.Speed = "--";
                    item.Eta = "Paused";
                }
                catch {}
            }
        }

        public static void CancelDownload(string id)
        {
            var item = Queue.FirstOrDefault(i => i.Id == id);
            if (item != null)
            {
                if (item.Status == "Downloading" && item.Process != null)
                {
                    try { item.Process.Kill(); } catch {}
                }
                item.Status = "Cancelled";
                item.Speed = "--";
                item.Eta = "Cancelled";
            }
        }

        public static void RemoveDownload(string id)
        {
            var item = Queue.FirstOrDefault(i => i.Id == id);
            if (item != null)
            {
                if (item.Status == "Downloading" && item.Process != null)
                {
                    try { item.Process.Kill(); } catch {}
                }
                Application.Current.Dispatcher.Invoke(() => Queue.Remove(item));
            }
        }

        public static void RetryDownload(string id)
        {
            var item = Queue.FirstOrDefault(i => i.Id == id);
            if (item != null && (item.Status == "Failed" || item.Status == "Cancelled" || item.Status == "Paused"))
            {
                item.Status = "Waiting";
                item.Percent = 0;
                item.Speed = "0 KB/s";
                item.Eta = "Waiting...";
                item.Error = string.Empty;

                _ = ProcessQueue();
            }
        }
    }
}
