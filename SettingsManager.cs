using System;
using System.IO;
using System.Text.Json;

namespace YoutubeDownloader
{
    public class UserSettings
    {
        public string DownloadFolder { get; set; } = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "Downloads");
        public string VideoQuality { get; set; } = "best";
        public string AudioFormat { get; set; } = "mp3";
        public string AudioQuality { get; set; } = "best";
        public bool SkipDuplicates { get; set; } = true;
        public int SimultaneousDownloads { get; set; } = 2;
        public bool AutoCheckUpdates { get; set; } = true;
        public bool SimpleMode { get; set; } = true;
    }

    public static class SettingsManager
    {
        private static readonly string AppDataFolder = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), 
            "YouTubeAccessibleDownloader"
        );
        private static readonly string SettingsFile = Path.Combine(AppDataFolder, "settings.json");
        
        public static UserSettings Current { get; private set; } = new UserSettings();

        static SettingsManager()
        {
            Load();
        }

        public static void Load()
        {
            try
            {
                if (!Directory.Exists(AppDataFolder))
                {
                    Directory.CreateDirectory(AppDataFolder);
                }

                if (File.Exists(SettingsFile))
                {
                    string json = File.ReadAllText(SettingsFile);
                    var loaded = JsonSerializer.Deserialize<UserSettings>(json);
                    if (loaded != null)
                    {
                        Current = loaded;
                    }
                }
                else
                {
                    Save();
                }
            }
            catch
            {
                Current = new UserSettings();
            }
        }

        public static void Save()
        {
            try
            {
                if (!Directory.Exists(AppDataFolder))
                {
                    Directory.CreateDirectory(AppDataFolder);
                }

                string json = JsonSerializer.Serialize(Current, new JsonSerializerOptions { WriteIndented = true });
                File.WriteAllText(SettingsFile, json);
            }
            catch (Exception ex)
            {
                System.Diagnostics.Debug.WriteLine($"Failed to save settings: {ex.Message}");
            }
        }
    }
}
