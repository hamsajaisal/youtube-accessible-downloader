using System;
using System.IO;
using System.IO.Compression;
using System.Net.Http;
using System.Threading.Tasks;
using System.Diagnostics;
using System.Text.Json;

namespace YoutubeDownloader
{
    public static class EngineManager
    {
        public static readonly string AppDataFolder = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), 
            "YouTubeAccessibleDownloader"
        );
        public static readonly string BinFolder = Path.Combine(AppDataFolder, "bin");
        public static readonly string YtDlpPath = Path.Combine(BinFolder, "yt-dlp.exe");
        public static readonly string FfmpegPath = Path.Combine(BinFolder, "ffmpeg.exe");

        public static bool YtDlpExists => File.Exists(YtDlpPath);
        public static bool FfmpegExists => File.Exists(FfmpegPath);

        static EngineManager()
        {
            if (!Directory.Exists(BinFolder))
            {
                Directory.CreateDirectory(BinFolder);
            }
        }

        public static async Task DownloadYtDlp(Action<int> progressCallback)
        {
            string url = "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe";
            await DownloadFileAsync(url, YtDlpPath, progressCallback);
        }

        public static async Task DownloadFfmpeg(Action<int> progressCallback)
        {
            string zipPath = Path.Combine(BinFolder, "ffmpeg.zip");
            string url = "https://github.com/ffbinaries/ffbinaries-prebuilt/releases/download/v4.4.1/ffmpeg-4.4.1-win-64.zip";
            
            await DownloadFileAsync(url, zipPath, progressCallback);
            
            // Extract ffmpeg.exe from zip
            await Task.Run(() =>
            {
                try
                {
                    using (ZipArchive archive = ZipFile.OpenRead(zipPath))
                    {
                        foreach (ZipArchiveEntry entry in archive.Entries)
                        {
                            if (entry.Name.Equals("ffmpeg.exe", StringComparison.OrdinalIgnoreCase))
                            {
                                string destPath = Path.Combine(BinFolder, entry.Name);
                                if (File.Exists(destPath)) File.Delete(destPath);
                                entry.ExtractToFile(destPath);
                            }
                        }
                    }
                    if (File.Exists(zipPath)) File.Delete(zipPath);
                }
                catch (Exception ex)
                {
                    Debug.WriteLine($"FFmpeg extraction failed: {ex.Message}");
                    throw;
                }
            });
        }

        public static async Task<string> UpdateYtDlp()
        {
            if (!YtDlpExists) return "yt-dlp is not installed.";

            return await Task.Run(() =>
            {
                try
                {
                    var startInfo = new ProcessStartInfo
                    {
                        FileName = YtDlpPath,
                        Arguments = "-U",
                        UseShellExecute = false,
                        RedirectStandardOutput = true,
                        RedirectStandardError = true,
                        CreateNoWindow = true
                    };

                    using (var process = Process.Start(startInfo))
                    {
                        if (process == null) return "Failed to start yt-dlp update process.";
                        
                        string output = process.StandardOutput.ReadToEnd();
                        string error = process.StandardError.ReadToEnd();
                        process.WaitForExit();

                        if (output.Contains("Latest version") || output.Contains("up to date"))
                        {
                            return "yt-dlp is already up to date.";
                        }
                        return "yt-dlp updated successfully:\n" + output + error;
                    }
                }
                catch (Exception ex)
                {
                    return $"Failed to update yt-dlp: {ex.Message}";
                }
            });
        }

        public static string AnalyzeUrl(string url)
        {
            if (!YtDlpExists)
            {
                return "{\"error\": \"yt-dlp engine is not installed.\"}";
            }

            try
            {
                var startInfo = new ProcessStartInfo
                {
                    FileName = YtDlpPath,
                    Arguments = $"-J --flat-playlist --no-warnings \"{url}\"",
                    UseShellExecute = false,
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                    CreateNoWindow = true
                };

                using (var process = Process.Start(startInfo))
                {
                    if (process == null) return "{\"error\": \"Failed to start analysis process.\"}";

                    string output = process.StandardOutput.ReadToEnd();
                    string error = process.StandardError.ReadToEnd();
                    process.WaitForExit();

                    if (process.ExitCode != 0)
                    {
                        string errMsg = string.IsNullOrWhiteSpace(error) ? "Unknown error from yt-dlp" : error;
                        return $"{{\"error\": {JsonSerializer.Serialize(errMsg)}}}";
                    }

                    return output;
                }
            }
            catch (Exception ex)
            {
                return $"{{\"error\": {JsonSerializer.Serialize(ex.Message)}}}";
            }
        }

        private static async Task DownloadFileAsync(string url, string destinationPath, Action<int> progressCallback)
        {
            using (var client = new HttpClient())
            {
                // Set User-Agent headers to prevent download blocking
                client.DefaultRequestHeaders.Add("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64)");
                
                using (var response = await client.GetAsync(url, HttpCompletionOption.ResponseHeadersRead))
                {
                    response.EnsureSuccessStatusCode();

                    var totalBytes = response.Content.Headers.ContentLength ?? -1L;
                    using (var contentStream = await response.Content.ReadAsStreamAsync())
                    using (var fileStream = new FileStream(destinationPath, FileMode.Create, FileAccess.Write, FileShare.None, 8192, true))
                    {
                        var buffer = new byte[8192];
                        long totalRead = 0L;
                        int bytesRead;

                        while ((bytesRead = await contentStream.ReadAsync(buffer, 0, buffer.Length)) > 0)
                        {
                            await fileStream.WriteAsync(buffer, 0, bytesRead);
                            totalRead += bytesRead;

                            if (totalBytes != -1)
                            {
                                int progress = (int)((double)totalRead / totalBytes * 100);
                                progressCallback?.Invoke(progress);
                            }
                        }
                    }
                }
            }
        }
    }
}
