using System;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Text.Json;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;

namespace YoutubeDownloader
{
    public partial class MainWindow : Window
    {
        private string _currentAnalysisUrl = string.Empty;
        private string _currentAnalysisTitle = string.Empty;

        public MainWindow()
        {
            InitializeComponent();
            
            // Connect download queue to ListView
            ListQueue.ItemsSource = DownloadManager.Queue;
            
            Loaded += MainWindow_Loaded;
            PreviewKeyDown += MainWindow_PreviewKeyDown;
        }

        private async void MainWindow_Loaded(object sender, RoutedEventArgs e)
        {
            // Initial path setups
            TxtSaveFolder.Text = SettingsManager.Current.DownloadFolder;
            TxtDefaultFolder.Text = SettingsManager.Current.DownloadFolder;
            
            // Sync default dropdowns
            SelectComboItemByTag(ComboDefaultVideoQuality, SettingsManager.Current.VideoQuality);
            SelectComboItemByTag(ComboDefaultAudioFormat, SettingsManager.Current.AudioFormat);
            SelectComboItemByTag(ComboSimultaneous, SettingsManager.Current.SimultaneousDownloads.ToString());
            ChkSkipDuplicates.IsChecked = SettingsManager.Current.SkipDuplicates;
            ChkAutoUpdate.IsChecked = SettingsManager.Current.AutoCheckUpdates;
            
            // Enable/Disable Advanced GUI based on stored config
            ChkAdvancedMode.IsChecked = !SettingsManager.Current.SimpleMode;

            // Update statuses of binaries
            UpdateEngineStatuses();

            // Run Auto Update on startup if enabled
            if (SettingsManager.Current.AutoCheckUpdates)
            {
                await AutoCheckEngineUpdates();
            }

            // Load and render history
            RefreshHistoryGrid();
            
            // Focus on URL TextBox initially
            TxtUrl.Focus();
        }

        // Update visual labels for yt-dlp & FFmpeg status
        private void UpdateEngineStatuses()
        {
            if (EngineManager.YtDlpExists)
            {
                TxtYtDlpStatus.Text = "Status: Installed and active.";
                TxtYtDlpStatus.Foreground = System.Windows.Media.Brushes.Green;
            }
            else
            {
                TxtYtDlpStatus.Text = "Status: Missing. Will download on first analysis.";
                TxtYtDlpStatus.Foreground = System.Windows.Media.Brushes.Red;
            }

            if (EngineManager.FfmpegExists)
            {
                TxtFfmpegStatus.Text = "Status: Installed and active (Required for 1080p+ merging and format conversions).";
                TxtFfmpegStatus.Foreground = System.Windows.Media.Brushes.Green;
                BtnDownloadFfmpeg.IsEnabled = false;
                BtnDownloadFfmpeg.Content = "Configured";
            }
            else
            {
                TxtFfmpegStatus.Text = "Status: Missing. High-quality downloads capped at 720p. Click download below to install.";
                TxtFfmpegStatus.Foreground = System.Windows.Media.Brushes.Orange;
                BtnDownloadFfmpeg.IsEnabled = true;
                BtnDownloadFfmpeg.Content = "Download & Configure";
            }
        }

        // Automatic update checking on startup
        private async Task AutoCheckEngineUpdates()
        {
            if (EngineManager.YtDlpExists)
            {
                TxtYtDlpStatus.Text = "Status: Checking for updates...";
                string result = await EngineManager.UpdateYtDlp();
                Debug.WriteLine(result);
                UpdateEngineStatuses();
            }
        }

        // Toggle simple/advanced sections visibility
        private void ChkAdvancedMode_Changed(object sender, RoutedEventArgs e)
        {
            if (GrpAdvanced == null) return;
            
            bool isAdvanced = ChkAdvancedMode.IsChecked == true;
            SettingsManager.Current.SimpleMode = !isAdvanced;
            SettingsManager.Current.Save();

            GrpAdvanced.Visibility = isAdvanced ? Visibility.Visible : Visibility.Collapsed;
        }

        // Handle URL analysis
        private async void BtnAnalyze_Click(object sender, RoutedEventArgs e)
        {
            string url = TxtUrl.Text.Trim();
            if (string.IsNullOrEmpty(url))
            {
                MessageBox.Show("Please paste a valid YouTube link first.", "Input Error", MessageBoxButton.OK, MessageBoxImage.Warning);
                TxtUrl.Focus();
                return;
            }

            // Hide config panel, show loading
            PanelMediaConfig.Visibility = Visibility.Collapsed;
            TxtLoading.Visibility = Visibility.Visible;
            BtnAnalyze.IsEnabled = false;

            // Auto download yt-dlp first if it's missing
            if (!EngineManager.YtDlpExists)
            {
                TxtLoading.Text = "yt-dlp engine missing. Downloading latest release... Please wait.";
                try
                {
                    await EngineManager.DownloadYtDlp((pct) =>
                    {
                        Dispatcher.Invoke(() => TxtLoading.Text = $"Downloading engine: {pct}%...");
                    });
                    UpdateEngineStatuses();
                }
                catch (Exception ex)
                {
                    MessageBox.Show($"Failed to download downloader engine: {ex.Message}", "Setup Error", MessageBoxButton.OK, MessageBoxImage.Error);
                    TxtLoading.Visibility = Visibility.Collapsed;
                    BtnAnalyze.IsEnabled = true;
                    return;
                }
            }

            TxtLoading.Text = "Analyzing link... Searching YouTube servers.";

            try
            {
                string json = await Task.Run(() => EngineManager.AnalyzeUrl(url));
                using (var doc = JsonDocument.Parse(json))
                {
                    var root = doc.RootElement;
                    if (root.TryGetProperty("error", out var errProp))
                    {
                        MessageBox.Show($"Analysis failed: {errProp.GetString()}", "Analysis Error", MessageBoxButton.OK, MessageBoxImage.Error);
                        TxtLoading.Visibility = Visibility.Collapsed;
                        BtnAnalyze.IsEnabled = true;
                        return;
                    }

                    string title = root.TryGetProperty("title", out var titleProp) ? titleProp.GetString() ?? "Unknown Title" : "Unknown Title";
                    string uploader = root.TryGetProperty("uploader", out var uploaderProp) ? uploaderProp.GetString() ?? "Unknown Channel" : "YouTube Channel";
                    double duration = root.TryGetProperty("duration", out var durProp) ? durProp.GetDouble() : 0.0;
                    string webUrl = root.TryGetProperty("webpage_url", out var webUrlProp) ? webUrlProp.GetString() ?? url : url;

                    TxtMediaTitle.Text = title;
                    TxtMediaUploader.Text = uploader;
                    
                    int mins = (int)(duration / 60);
                    int secs = (int)(duration % 60);
                    TxtMediaDuration.Text = duration > 0 ? $"Duration: {mins}:{secs:D2}" : "Playlist / Dynamic Stream";

                    _currentAnalysisUrl = webUrl;
                    _currentAnalysisTitle = title;

                    // Initialize type and formats dropdowns
                    PopulateFormatsDropdown();
                    
                    TxtLoading.Visibility = Visibility.Collapsed;
                    PanelMediaConfig.Visibility = Visibility.Visible;
                }
            }
            catch (Exception ex)
            {
                MessageBox.Show($"Failed to parse link: {ex.Message}", "Analysis Error", MessageBoxButton.OK, MessageBoxImage.Error);
                TxtLoading.Visibility = Visibility.Collapsed;
            }
            finally
            {
                BtnAnalyze.IsEnabled = true;
            }
        }

        private void PopulateFormatsDropdown()
        {
            ComboFormat.Items.Clear();
            ComboQuality.Items.Clear();

            var selectedTypeItem = ComboType.SelectedItem as ComboBoxItem;
            string type = selectedTypeItem?.Tag as string ?? "video";

            if (type == "video")
            {
                ComboFormat.Items.Add(new ComboBoxItem { Content = "MP4 Video (.mp4)", Tag = "mp4", IsSelected = true });
                ComboFormat.Items.Add(new ComboBoxItem { Content = "MKV Video (.mkv)", Tag = "mkv" });

                ComboQuality.Items.Add(new ComboBoxItem { Content = "Best Available Quality", Tag = "best", IsSelected = true });
                ComboQuality.Items.Add(new ComboBoxItem { Content = "Full HD (1080p)", Tag = "1080" });
                ComboQuality.Items.Add(new ComboBoxItem { Content = "HD (720p)", Tag = "720" });
                ComboQuality.Items.Add(new ComboBoxItem { Content = "Standard (480p)", Tag = "480" });
                ComboQuality.Items.Add(new ComboBoxItem { Content = "Low (360p)", Tag = "360" });
            }
            else
            {
                ComboFormat.Items.Add(new ComboBoxItem { Content = "MP3 Audio (.mp3)", Tag = "mp3", IsSelected = true });
                ComboFormat.Items.Add(new ComboBoxItem { Content = "M4A Audio (.m4a)", Tag = "m4a" });
                ComboFormat.Items.Add(new ComboBoxItem { Content = "WAV Audio (.wav)", Tag = "wav" });
                ComboFormat.Items.Add(new ComboBoxItem { Content = "FLAC Lossless (.flac)", Tag = "flac" });

                ComboQuality.Items.Add(new ComboBoxItem { Content = "Highest Quality (320kbps)", Tag = "best", IsSelected = true });
                ComboQuality.Items.Add(new ComboBoxItem { Content = "High Quality (256kbps)", Tag = "high" });
                ComboQuality.Items.Add(new ComboBoxItem { Content = "Medium Quality (128kbps)", Tag = "medium" });
                ComboQuality.Items.Add(new ComboBoxItem { Content = "Low Quality (96kbps)", Tag = "low" });
            }
        }

        private void ComboType_SelectionChanged(object sender, SelectionChangedEventArgs e)
        {
            if (ComboFormat == null || ComboQuality == null) return;
            PopulateFormatsDropdown();
        }

        private void ComboFormat_SelectionChanged(object sender, SelectionChangedEventArgs e) {}

        // Browse folders Dialog handlers
        private void BtnBrowseFolder_Click(object sender, RoutedEventArgs e)
        {
            var dialog = new Microsoft.Win32.OpenFolderDialog();
            dialog.InitialDirectory = TxtSaveFolder.Text;
            if (dialog.ShowDialog() == true)
            {
                TxtSaveFolder.Text = dialog.FolderName;
            }
        }

        private void BtnBrowseDefaultFolder_Click(object sender, RoutedEventArgs e)
        {
            var dialog = new Microsoft.Win32.OpenFolderDialog();
            dialog.InitialDirectory = TxtDefaultFolder.Text;
            if (dialog.ShowDialog() == true)
            {
                TxtDefaultFolder.Text = dialog.FolderName;
                SettingsManager.Current.DownloadFolder = dialog.FolderName;
                SettingsManager.Current.Save();
                TxtSaveFolder.Text = dialog.FolderName;
            }
        }

        // Toggles in advanced expander
        private void ChkPartial_Changed(object sender, RoutedEventArgs e)
        {
            if (PanelPartialTimes == null) return;
            PanelPartialTimes.Visibility = ChkPartial.IsChecked == true ? Visibility.Visible : Visibility.Collapsed;
        }

        private void ChkSubtitles_Changed(object sender, RoutedEventArgs e)
        {
            if (PanelSubtitles == null) return;
            PanelSubtitles.Visibility = ChkSubtitles.IsChecked == true ? Visibility.Visible : Visibility.Collapsed;
        }

        // Download submission logic
        private void BtnAddToQueue_Click(object sender, RoutedEventArgs e)
        {
            if (string.IsNullOrEmpty(_currentAnalysisUrl)) return;

            var typeItem = ComboType.SelectedItem as ComboBoxItem;
            var formatItem = ComboFormat.SelectedItem as ComboBoxItem;
            var qualityItem = ComboQuality.SelectedItem as ComboBoxItem;

            var config = new DownloadConfig
            {
                Mode = typeItem?.Tag as string ?? "video",
                DownloadFolder = TxtSaveFolder.Text,
                
                VideoFormat = formatItem?.Tag as string ?? "mp4",
                AudioFormat = formatItem?.Tag as string ?? "mp3",
                
                VideoQuality = qualityItem?.Tag as string ?? "best",
                AudioQuality = qualityItem?.Tag as string ?? "best",
                
                PartialDownload = ChkPartial.IsChecked == true,
                TimeStart = TxtTimeStart.Text.Trim(),
                TimeEnd = TxtTimeEnd.Text.Trim(),
                
                DownloadSubtitles = ChkSubtitles.IsChecked == true,
                SubtitleLang = (ComboSubLang.SelectedItem as ComboBoxItem)?.Tag as string ?? "en",
                SubtitleType = (ComboSubType.SelectedItem as ComboBoxItem)?.Tag as string ?? "manual",
                EmbedSubtitles = ChkEmbedSubtitles.IsChecked == true,

                EmbedMetadata = ChkEmbedMetadata.IsChecked == true,
                EmbedThumbnail = ChkEmbedThumbnail.IsChecked == true
            };

            // Queue the download
            DownloadManager.AddToQueue(_currentAnalysisUrl, _currentAnalysisTitle, qualityItem?.Content?.ToString() ?? "", config);

            // Navigate to Queue Tab
            MainTabControl.SelectedItem = MainTabControl.Items[1];

            // Clear down downloader configurations
            PanelMediaConfig.Visibility = Visibility.Collapsed;
            TxtUrl.Text = string.Empty;
            _currentAnalysisUrl = string.Empty;
            _currentAnalysisTitle = string.Empty;
            
            // Inform Screen Reader of navigation
            TxtQueueHeader.Focus();
        }

        // Queue Controls clicks
        private void BtnPauseDownload_Click(object sender, RoutedEventArgs e)
        {
            if (sender is Button btn && btn.Tag is string id)
            {
                DownloadManager.PauseDownload(id);
            }
        }

        private void BtnResumeDownload_Click(object sender, RoutedEventArgs e)
        {
            if (sender is Button btn && btn.Tag is string id)
            {
                DownloadManager.RetryDownload(id);
            }
        }

        private void BtnRemoveDownload_Click(object sender, RoutedEventArgs e)
        {
            if (sender is Button btn && btn.Tag is string id)
            {
                DownloadManager.RemoveDownload(id);
            }
        }

        private void BtnClearCompleted_Click(object sender, RoutedEventArgs e)
        {
            var completedIds = DownloadManager.Queue.Where(i => i.Status == "Completed").Select(i => i.Id).ToList();
            foreach (var id in completedIds)
            {
                DownloadManager.RemoveDownload(id);
            }
        }

        private void BtnClearFailed_Click(object sender, RoutedEventArgs e)
        {
            var failedIds = DownloadManager.Queue.Where(i => i.Status == "Failed" || i.Status == "Cancelled").Select(i => i.Id).ToList();
            foreach (var id in failedIds)
            {
                DownloadManager.RemoveDownload(id);
            }
        }

        // History logs logic
        private void RefreshHistoryGrid()
        {
            string filter = TxtSearchHistory.Text.Trim().ToLower();
            if (string.IsNullOrEmpty(filter))
            {
                GridHistory.ItemsSource = HistoryManager.Items;
            }
            else
            {
                GridHistory.ItemsSource = HistoryManager.Items.Where(i => 
                    i.Title.ToLower().Contains(filter) || 
                    i.Format.ToLower().Contains(filter) || 
                    i.Status.ToLower().Contains(filter)
                ).ToList();
            }
        }

        private void TxtSearchHistory_TextChanged(object sender, TextChangedEventArgs e)
        {
            RefreshHistoryGrid();
        }

        private void BtnClearHistory_Click(object sender, RoutedEventArgs e)
        {
            if (MessageBox.Show("Are you sure you want to clear your entire download history?", "Clear History", MessageBoxButton.YesNo, MessageBoxImage.Question) == MessageBoxResult.Yes)
            {
                HistoryManager.Clear();
                RefreshHistoryGrid();
            }
        }

        private void BtnOpenHistoryFolder_Click(object sender, RoutedEventArgs e)
        {
            if (sender is Button btn && btn.Tag is string path && Directory.Exists(path))
            {
                try
                {
                    Process.Start("explorer.exe", $"\"{path}\"");
                }
                catch (Exception ex)
                {
                    MessageBox.Show($"Failed to open directory: {ex.Message}", "Explorer Error", MessageBoxButton.OK, MessageBoxImage.Error);
                }
            }
        }

        // Settings Panel Logic changes
        private void ComboDefaultVideoQuality_Changed(object sender, SelectionChangedEventArgs e)
        {
            if (ComboDefaultVideoQuality == null) return;
            var item = ComboDefaultVideoQuality.SelectedItem as ComboBoxItem;
            SettingsManager.Current.VideoQuality = item?.Tag as string ?? "best";
            SettingsManager.Current.Save();
        }

        private void ComboDefaultAudioFormat_Changed(object sender, SelectionChangedEventArgs e)
        {
            if (ComboDefaultAudioFormat == null) return;
            var item = ComboDefaultAudioFormat.SelectedItem as ComboBoxItem;
            SettingsManager.Current.AudioFormat = item?.Tag as string ?? "mp3";
            SettingsManager.Current.Save();
        }

        private void ChkSkipDuplicates_Changed(object sender, RoutedEventArgs e)
        {
            if (ChkSkipDuplicates == null) return;
            SettingsManager.Current.SkipDuplicates = ChkSkipDuplicates.IsChecked == true;
            SettingsManager.Current.Save();
        }

        private void ComboSimultaneous_Changed(object sender, SelectionChangedEventArgs e)
        {
            if (ComboSimultaneous == null) return;
            var item = ComboSimultaneous.SelectedItem as ComboBoxItem;
            if (int.TryParse(item?.Tag as string, out int val))
            {
                SettingsManager.Current.SimultaneousDownloads = val;
                SettingsManager.Current.Save();
            }
        }

        private void ChkAutoUpdate_Changed(object sender, RoutedEventArgs e)
        {
            if (ChkAutoUpdate == null) return;
            SettingsManager.Current.AutoCheckUpdates = ChkAutoUpdate.IsChecked == true;
            SettingsManager.Current.Save();
        }

        private async void BtnUpdateYtDlp_Click(object sender, RoutedEventArgs e)
        {
            BtnUpdateYtDlp.IsEnabled = false;
            TxtYtDlpStatus.Text = "Status: Updating yt-dlp. Please wait...";
            try
            {
                string result = await EngineManager.UpdateYtDlp();
                MessageBox.Show(result, "Engine Update", MessageBoxButton.OK, MessageBoxImage.Information);
            }
            catch (Exception ex)
            {
                MessageBox.Show($"Failed to update engine: {ex.Message}", "Update Error", MessageBoxButton.OK, MessageBoxImage.Error);
            }
            finally
            {
                UpdateEngineStatuses();
                BtnUpdateYtDlp.IsEnabled = true;
            }
        }

        private async void BtnDownloadFfmpeg_Click(object sender, RoutedEventArgs e)
        {
            BtnDownloadFfmpeg.IsEnabled = false;
            TxtFfmpegStatus.Text = "Status: Downloading FFmpeg for Windows. Please wait...";
            try
            {
                await EngineManager.DownloadFfmpeg((pct) =>
                {
                    Dispatcher.Invoke(() => TxtFfmpegStatus.Text = $"Status: Downloading FFmpeg: {pct}%...");
                });
                MessageBox.Show("FFmpeg configured and activated successfully!", "FFmpeg Configured", MessageBoxButton.OK, MessageBoxImage.Information);
            }
            catch (Exception ex)
            {
                MessageBox.Show($"Failed to configure FFmpeg: {ex.Message}", "Download Error", MessageBoxButton.OK, MessageBoxImage.Error);
            }
            finally
            {
                UpdateEngineStatuses();
            }
        }

        // Global Hotkeys Listener
        private void MainWindow_PreviewKeyDown(object sender, KeyEventArgs e)
        {
            // Switch tabs: Ctrl + 1-4
            if ((Keyboard.Modifiers & ModifierKeys.Control) == ModifierKeys.Control)
            {
                if (e.Key >= Key.D1 && e.Key <= Key.D4)
                {
                    int index = e.Key - Key.D1;
                    if (index < MainTabControl.Items.Count)
                    {
                        MainTabControl.SelectedIndex = index;
                        
                        // Set focus to the tab item header to inform screen readers
                        var tabItem = MainTabControl.Items[index] as TabItem;
                        tabItem?.Focus();
                        
                        e.Handled = true;
                    }
                }
                // Ctrl + N: focus and clear search or input
                else if (e.Key == Key.N)
                {
                    MainTabControl.SelectedIndex = 0;
                    TxtUrl.Text = string.Empty;
                    TxtUrl.Focus();
                    e.Handled = true;
                }
                // Ctrl + Enter: Trigger Download
                else if (e.Key == Key.Enter)
                {
                    if (PanelMediaConfig.Visibility == Visibility.Visible && BtnAddToQueue.IsEnabled)
                    {
                        BtnAddToQueue_Click(this, new RoutedEventArgs());
                        e.Handled = true;
                    }
                }
            }
        }

        private void TxtUrl_KeyDown(object sender, KeyEventArgs e)
        {
            if (e.Key == Key.Enter)
            {
                BtnAnalyze_Click(this, new RoutedEventArgs());
                e.Handled = true;
            }
        }

        private void MainTabControl_SelectionChanged(object sender, SelectionChangedEventArgs e)
        {
            if (e.Source is TabControl)
            {
                // Refresh list bindings/history when tab switches
                if (MainTabControl.SelectedIndex == 2)
                {
                    RefreshHistoryGrid();
                }
            }
        }

        private void SelectComboItemByTag(ComboBox combo, string tag)
        {
            if (combo == null) return;
            foreach (ComboBoxItem item in combo.Items)
            {
                if (item.Tag?.ToString() == tag)
                {
                    combo.SelectedItem = item;
                    break;
                }
            }
        }
    }
}
