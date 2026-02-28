# YouTube Doomscroll Blocker

A Chrome extension to help reduce YouTube doomscrolling by blocking Shorts scrolling and tracking consumption stats.

## Features

1. **Prevents YouTube Shorts Scrolling**: Disables both mouse wheel and keyboard scrolling on YouTube Shorts pages
2. **Consumption Stats**: Displays real-time stats in the YouTube header showing:
   - Number of videos watched
   - Number of shorts watched
   - Total watch time

## Installation

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" (toggle in top right)
3. Click "Load unpacked"
4. Select this project directory
5. The extension will now be active on YouTube

## Usage

- The extension automatically activates when you visit YouTube
- Stats are displayed in the top header of YouTube pages
- Stats persist across browser sessions
- Shorts scrolling is automatically disabled when viewing Shorts

## Files

- `manifest.json` - Extension configuration
- `content.js` - Main logic for blocking scrolling and tracking stats
- `background.js` - Background service worker for initialization
- `styles.css` - Styling for the stats display

## Icon Files

You'll need to add icon files (`icon16.png`, `icon48.png`, `icon128.png`) to the project directory. You can create simple icons or use placeholder images for now.
