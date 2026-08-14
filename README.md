# YouTube Accessible Downloader

An accessible, modern, and powerful Windows desktop application to download YouTube videos and audio.

This project is built using **Electron (HTML5, Vanilla CSS, Vanilla JS)** and utilizes the **yt-dlp** command-line engine and **FFmpeg** as the backend download processors.

## Features

- **High Accessibility**: Native integration with screen readers like **NVDA, JAWS, and Narrator** (no built-in speech synthesis, letting your screen reader read everything naturally).
- **Interactive Modals & Focus Trapping**: Fully navigable via keyboard; focus stays contained within active modals and returns logically.
- **Accessible Queue & Progress**: Real-time download progress announcements (`percent`, `speed`, `ETA`) pushed to screen readers via ARIA live regions.
- **Global Keyboard Shortcuts**: Fast panels navigation and link addition inputs.
- **yt-dlp Auto-Updater**: Prompts users with Yes/No choices before updating the engine binary in the background.
- **FFmpeg Integration**: Warns users when FFmpeg is missing and downloads/configures it automatically with permission.
- **Modern Dark Interface**: Custom Indigo Slate theme designed for visual appeal and high readability.

## Local Development & Installation

### Prerequisites

- [Node.js](https://nodejs.org/) (Version 16 or newer)

### How to Run Locally

1. Clone or download the repository.
2. In the project directory, run:
   ```bash
   npm install
   ```
3. Run the application:
   ```bash
   npm start
   ```
4. *Recommendation*: Open the **Settings** tab inside the app and click **Download & Configure FFmpeg** on first launch to enable high-quality video merging.

### How to Build a Portable Version / Installer

To compile the application into a Windows Installer `.exe` and a Portable `.zip` build:
```bash
npm run build
```
The packaged binaries will be output to the `dist/` directory.

## Automated Builds via GitHub Actions

This repository is pre-configured with a GitHub Actions CI/CD workflow. Whenever you create and push a release tag (e.g. `v1.0.0`) to GitHub, the workflow automatically:
1. Builds the Electron app on a Windows server.
2. Creates a GitHub Release.
3. Uploads the Setup Installer `.exe` and Portable `.zip` files as release downloads.
