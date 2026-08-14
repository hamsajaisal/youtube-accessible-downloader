[Setup]
AppName=YouTube Accessible Downloader
AppVersion=2.0.0
DefaultDirName={autopf}\YouTube Accessible Downloader
DefaultGroupName=YouTube Accessible Downloader
UninstallDisplayIcon={app}\YoutubeDownloader.exe
Compression=lzma2
SolidCompression=yes
OutputDir=.
OutputBaseFilename=YouTube.Accessible.Downloader.Setup
ArchitecturesAllowed=x64
ArchitecturesInstallIn64BitMode=x64

[Files]
Source: "publish\YoutubeDownloader.exe"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{group}\YouTube Accessible Downloader"; Filename: "{app}\YoutubeDownloader.exe"
Name: "{autodesktop}\YouTube Accessible Downloader"; Filename: "{app}\YoutubeDownloader.exe"
