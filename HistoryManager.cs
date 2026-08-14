using System;
using System.Collections.Generic;
using System.IO;
using System.Text.Json;

namespace YoutubeDownloader
{
    public class HistoryItem
    {
        public string Date { get; set; } = string.Empty;
        public string Title { get; set; } = string.Empty;
        public string Format { get; set; } = string.Empty;
        public string Status { get; set; } = string.Empty;
        public string Location { get; set; } = string.Empty;
    }

    public static class HistoryManager
    {
        private static readonly string AppDataFolder = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), 
            "YouTubeAccessibleDownloader"
        );
        private static readonly string HistoryFile = Path.Combine(AppDataFolder, "history.json");
        
        public static List<HistoryItem> Items { get; private set; } = new List<HistoryItem>();

        static HistoryManager()
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

                if (File.Exists(HistoryFile))
                {
                    string json = File.ReadAllText(HistoryFile);
                    var loaded = JsonSerializer.Deserialize<List<HistoryItem>>(json);
                    if (loaded != null)
                    {
                        Items = loaded;
                    }
                }
            }
            catch
            {
                Items = new List<HistoryItem>();
            }
        }

        public static void Add(string title, string format, string status, string location)
        {
            try
            {
                var item = new HistoryItem
                {
                    Date = DateTime.Now.ToString("yyyy-MM-dd HH:mm"),
                    Title = title,
                    Format = format,
                    Status = status,
                    Location = location
                };

                Items.Insert(0, item); // Insert at top
                Save();
            }
            catch (Exception ex)
            {
                System.Diagnostics.Debug.WriteLine($"Failed to add history item: {ex.Message}");
            }
        }

        public static void Clear()
        {
            try
            {
                Items.Clear();
                Save();
            }
            catch (Exception ex)
            {
                System.Diagnostics.Debug.WriteLine($"Failed to clear history: {ex.Message}");
            }
        }

        private static void Save()
        {
            try
            {
                if (!Directory.Exists(AppDataFolder))
                {
                    Directory.CreateDirectory(AppDataFolder);
                }

                string json = JsonSerializer.Serialize(Items, new JsonSerializerOptions { WriteIndented = true });
                File.WriteAllText(HistoryFile, json);
            }
            catch (Exception ex)
            {
                System.Diagnostics.Debug.WriteLine($"Failed to save history: {ex.Message}");
            }
        }
    }
}
