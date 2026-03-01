# YouTube Doomscroll Blocker - Project Documentation

## Overview
A Chrome extension designed to reduce YouTube doomscrolling by preventing Shorts scrolling and displaying consumption statistics. The extension tracks videos watched, shorts watched, and total watch time, with a daily reset at 3 AM local time.

## Core Features

### 1. Shorts Scrolling Prevention
- **Purpose**: Disable all scrolling mechanisms on YouTube Shorts pages
- **Methods Blocked**:
  - Mouse wheel scrolling (`wheel` event)
  - Keyboard navigation (arrow keys, spacebar, Page Up/Down)
  - Touch gestures (`touchmove` event)
- **Implementation**: Event listeners that prevent default behavior and stop propagation on Shorts pages

### 2. Consumption Statistics Display
- **Location**: YouTube header (right side, before Create button)
- **Metrics Tracked**:
  - **Videos**: Count of unique regular videos watched (hashset-based)
  - **Shorts**: Count of unique shorts watched (hashset-based)
  - **Time**: Total watch time in HH:MM:SS format (or MM:SS/SS if shorter)
- **Visual Indicators**:
  - SVG icons for videos and shorts
  - Paused state indication (dimmed/muted appearance)
  - Real-time updates every second

### 3. Time Tracking
- **Features**:
  - Tracks time continuously while videos play, even in background tabs
  - Accounts for paused state
  - Updates display in real-time (second-by-second)
  - Persists to `chrome.storage.local` periodically
- **Format**: Dynamic formatting (SS, MM:SS, or HH:MM:SS based on duration)

### 4. Daily Reset
- **Time**: 3 AM local time
- **Mechanism**: 
  - Background service worker checks hourly via `chrome.alarms`
  - Content script also checks periodically
  - Resets `videos`, `shorts` hashsets and `totalTime` to zero
  - Updates `lastResetDate` to prevent duplicate resets

## File Structure

### Core Files

#### `manifest.json`
- **Manifest Version**: 3
- **Permissions**:
  - `storage`: For persisting stats
  - `activeTab`: For content script access
  - `alarms`: For daily reset scheduling
- **Host Permissions**: `https://www.youtube.com/*`
- **Content Scripts**: Runs `content.js` and `styles.css` at `document_start`
- **Background**: Service worker (`background.js`)
- **Web Accessible Resources**: SVG/PNG/JPG icons from `icons/` directory

#### `content.js` (Main Logic)
- **Initialization Flow**:
  1. `checkForDailyReset()` - Loads stats from storage (Promise-based to prevent race conditions)
  2. `init()` - Sets up DOM observers, event listeners, and UI
  3. `createStatsDisplay()` - Creates and inserts stats container in YouTube header
  4. `loadSVGIcon()` - Loads SVG icons inline for styling control

- **Key Functions**:
  - `disableShortsScrolling()`: Prevents scroll events on Shorts pages
  - `trackVideo()`: Tracks video playback time and adds to hashsets
  - `handleUrlChange()`: Detects navigation and extracts video/short info
  - `extractVideoInfo()`: Parses URL to determine type (video/short) and ID
  - `updateStatsDisplay()`: Updates UI with current stats
  - `formatTime()`: Formats seconds into HH:MM:SS display
  - `saveStats()`: Persists stats to `chrome.storage.local`

- **State Management**:
  - `stats`: Object with `videos: {}`, `shorts: {}`, `totalTime: 0`
  - Uses hashsets (objects) to track unique video IDs: `{ videoId1: true, videoId2: true }`
  - `currentVideoId`: Tracks currently playing video to prevent double-counting
  - `currentSessionTime`: Tracks time for current video session

- **SPA Navigation Detection**:
  - `MutationObserver` watches for DOM changes
  - URL change detection via `popstate` and `pushstate` interception
  - Periodic checks for video element changes

#### `background.js` (Service Worker)
- **Purpose**: Handles daily reset logic
- **Functions**:
  - `checkAndResetDaily()`: Checks if reset is needed (3 AM + different day)
  - `getNext3AM()`: Calculates next 3 AM timestamp (currently unused but available)
- **Alarms**: Hourly check via `chrome.alarms` API
- **Lifecycle Hooks**:
  - `onInstalled`: Initializes storage and sets up alarms
  - `onStartup`: Checks for reset on browser startup
  - `onAlarm`: Handles hourly reset checks

#### `styles.css`
- **Stats Display Styling**:
  - Positioned in YouTube header
  - Responsive design (adjusts for different screen sizes)
  - Matches YouTube's design system (uses CSS variables)
- **Icon Styling**:
  - `.stats-icon-container`: Container for inline SVG icons
  - `.stats-icon`: SVG icon styling with `currentColor` for theming
  - Normalized stroke width and color
- **Visual Feedback**:
  - `.stats-time-paused`: Dimmed appearance when timer is paused
  - Scroll blocking animations (shake/buzz effects)

#### `icons/video-icon.svg`
- **Structure**:
  - Outer rounded rectangle frame (adjustable thickness)
  - Solid play triangle in center
- **Styling**: Uses `fill="currentColor"` for CSS color control
- **Frame Thickness**: Controlled by inner rectangle offset (currently 2px)

#### `icons/shorts-icon.svg`
- **Structure**: YouTube Shorts logo (two overlapping rectangles)
- **Styling**: Uses `fill="currentColor"` for CSS color control

## Technical Details

### Data Storage
- **Storage Key**: `youtubeStats`
- **Structure**:
  ```javascript
  {
    videos: { videoId1: true, videoId2: true, ... },  // Hashset
    shorts: { shortId1: true, shortId2: true, ... },  // Hashset
    totalTime: 12345  // Total seconds watched
  }
  ```
- **Additional Keys**:
  - `lastResetDate`: String representation of last reset date (e.g., "Mon Jan 01 2024")

### URL Patterns
- **Regular Videos**: `/watch?v=VIDEO_ID`
- **Shorts**: `/shorts/VIDEO_ID` or `/shorts` (with video ID in player)

### Video Detection
- Uses `document.querySelector('video')` to find video element
- Checks `video.paused` for playback state
- Listens to `play`, `pause`, `ended` events
- Handles `visibilitychange` for background tab tracking

### SVG Icon Loading
- Icons are loaded via `fetch()` from `chrome.runtime.getURL()`
- Parsed with `DOMParser` and inserted inline
- Allows CSS control via `currentColor`
- Normalized for consistent appearance (stroke-width, color)

### Race Condition Prevention
- `checkForDailyReset()` returns a Promise
- `init()` waits for stats to load before executing
- Prevents `handleUrlChange()` from accessing empty stats object

## Browser Compatibility
- Chrome/Chromium-based browsers (Manifest V3)
- Requires Chrome Extensions API support

## Future Considerations
- Time icon (currently uses text label "Time:")
- Additional blocking features (infinite scroll, recommendations)
- User preferences/settings
- Export statistics functionality

## Development Notes
- Extension must be reloaded after `manifest.json` changes
- SVG icons require `web_accessible_resources` in manifest
- Content script runs at `document_start` for early DOM access
- Stats display insertion uses multiple fallback selectors for YouTube's dynamic DOM
