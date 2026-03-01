# Session Tracking Technical Plan

## Overview
Add session-based time tracking to complement the existing daily time tracking. A session is defined by a 30-minute cooldown period - if the user goes 30 minutes without watching any YouTube video, a new session begins.

## Requirements
1. **Display two time metrics:**
   - **Time (Daily)**: Total time spent on YouTube for the entire day (existing functionality)
   - **Session**: Time spent in the current session (new functionality)

2. **Session Definition:**
   - Session starts when user begins watching a video after a 30-minute cooldown
   - Session continues as long as user watches videos within 30 minutes of each other
   - Session resets when 30 minutes pass without any video activity

3. **Persistence:**
   - Session state must persist across browser restarts
   - Session state must persist across YouTube page navigations (SPA)
   - Session state must be checked on extension startup and page load

## Technical Design

### 1. Storage Schema Changes

**New storage keys:**
```javascript
{
  youtubeStats: {
    videos: {},
    shorts: {},
    totalTime: 0,        // Daily total (existing)
    sessionTime: 0       // Current session time in seconds (new)
  },
  sessionState: {
    sessionStartTime: timestamp,    // When current session started
    lastActivityTime: timestamp,    // Last time a video was watched
    isActive: boolean               // Whether session is currently active
  }
}
```

### 2. Session Detection Logic

**Session Start Conditions:**
- User starts watching a video AND
- Either:
  - No previous session exists, OR
  - Last activity was > 30 minutes ago, OR
  - Session was marked as inactive

**Session Continuation:**
- User watches videos within 30 minutes of each other
- Update `lastActivityTime` on each video play event

**Session End:**
- 30 minutes pass without any video activity
- Mark session as inactive
- Reset `sessionTime` to 0
- Keep `sessionStartTime` for reference (or clear it)

### 3. Implementation Details

#### A. Content Script (`content.js`)

**New Variables:**
```javascript
let sessionTime = 0;              // Current session time (seconds)
let sessionStartTime = null;      // Timestamp when session started
let lastActivityTime = null;      // Timestamp of last video activity
let sessionCheckInterval = null;  // Interval to check for session expiration
```

**New Functions:**

1. **`checkSessionState()`**
   - Called on page load and periodically
   - Checks if 30 minutes have passed since `lastActivityTime`
   - If expired: reset session, mark as inactive
   - Returns Promise that resolves with session state

2. **`startNewSession()`**
   - Sets `sessionStartTime` to current timestamp
   - Sets `lastActivityTime` to current timestamp
   - Resets `sessionTime` to 0
   - Marks session as active
   - Saves to storage

3. **`updateSessionActivity()`**
   - Called when video starts playing
   - Updates `lastActivityTime` to current timestamp
   - If session was inactive, starts new session
   - Saves to storage

4. **`checkSessionExpiration()`**
   - Runs periodically (every 1-2 minutes)
   - Checks if `lastActivityTime` is > 30 minutes ago
   - If expired: ends session, resets `sessionTime`

5. **`loadSessionState()`**
   - Loads session state from storage on init
   - Checks if session should be expired based on stored `lastActivityTime`
   - If expired, starts new session; otherwise, resumes existing session

**Modified Functions:**

1. **`trackVideo()` / `handlePlay()`**
   - Call `updateSessionActivity()` when video starts playing
   - Increment `sessionTime` along with `currentSessionTime`

2. **`startUpdateInterval()`**
   - Increment both `currentSessionTime` (for daily) and `sessionTime` (for session)
   - Both should increment when video is playing

3. **`updateStatsDisplay()`**
   - Add new display element for session time
   - Show both daily total and session time

4. **`createStatsDisplay()`**
   - Add new stats item for "Session" time
   - Format: "Session: XX:XX:XX"

5. **`checkForDailyReset()`**
   - Also reset session state when daily reset occurs
   - Reset `sessionTime` to 0, clear session state

#### B. Background Script (`background.js`)

**New Functions:**

1. **`checkSessionExpirationOnStartup()`**
   - Called on extension startup
   - Checks if stored session should be expired
   - If expired, resets session state in storage

**Modified Functions:**

1. **`checkAndResetDaily()`**
   - Also reset session state when daily reset occurs

#### C. UI Changes (`styles.css`)

**New Styles:**
- Add styling for session time display (similar to existing time display)
- Consider visual distinction between daily and session time (e.g., different opacity or color)

### 4. Session State Machine

```
INACTIVE → (video plays) → ACTIVE
   ↑                           ↓
   └─── (30 min cooldown) ─────┘
```

**States:**
- **INACTIVE**: No active session, waiting for user to start watching
- **ACTIVE**: Session in progress, tracking time

**Transitions:**
- INACTIVE → ACTIVE: User starts watching video
- ACTIVE → INACTIVE: 30 minutes pass without video activity

### 5. Edge Cases & Considerations

1. **Browser Restart:**
   - On page load, check if stored session is still valid
   - If `lastActivityTime` was > 30 minutes ago, start new session
   - Otherwise, resume existing session

2. **Multiple Tabs:**
   - Session state is shared across tabs (via storage)
   - Last activity in any tab updates `lastActivityTime`
   - Session expiration check should work across tabs

3. **Page Navigation (SPA):**
   - YouTube is a SPA, so content script persists
   - Session state should persist across navigations
   - Check session state on URL changes

4. **Video Paused:**
   - Paused videos don't count toward session time
   - But don't reset the session cooldown timer
   - `lastActivityTime` is only updated when video plays, not pauses

5. **Daily Reset:**
   - When daily reset occurs at 3 AM, also reset session
   - Start fresh session for new day

6. **Storage Sync:**
   - Save session state periodically (every 5-10 seconds when active)
   - Save immediately on session start/end
   - Save on page unload

### 6. Implementation Steps

1. **Phase 1: Storage & State Management**
   - Add session state to storage schema
   - Implement `loadSessionState()` function
   - Implement `saveSessionState()` function
   - Update `checkForDailyReset()` to reset session

2. **Phase 2: Session Detection**
   - Implement `checkSessionState()` function
   - Implement `startNewSession()` function
   - Implement `updateSessionActivity()` function
   - Implement `checkSessionExpiration()` function

3. **Phase 3: Time Tracking**
   - Add `sessionTime` variable
   - Modify `startUpdateInterval()` to track session time
   - Ensure session time increments only when video is playing

4. **Phase 4: UI Updates**
   - Add session time display to `createStatsDisplay()`
   - Update `updateStatsDisplay()` to show session time
   - Add appropriate styling

5. **Phase 5: Integration**
   - Integrate session checks into video tracking
   - Add periodic session expiration checks
   - Test edge cases (browser restart, multiple tabs, etc.)

6. **Phase 6: Background Script**
   - Add session expiration check on startup
   - Ensure daily reset also resets session

### 7. Testing Scenarios

1. **New Session Start:**
   - User hasn't watched videos in > 30 minutes
   - User starts watching → session should start

2. **Session Continuation:**
   - User watches video, pauses, watches again within 30 min
   - Session should continue, time should accumulate

3. **Session Expiration:**
   - User watches video, then closes browser
   - Reopens browser > 30 minutes later
   - Session should be expired, new session should start

4. **Daily Reset:**
   - At 3 AM, both daily time and session should reset

5. **Multiple Tabs:**
   - Open YouTube in two tabs
   - Watch video in tab 1, then tab 2
   - Session should continue, time should accumulate

6. **Paused Videos:**
   - Watch video, pause for 25 minutes, resume
   - Session should continue (within 30 min window)

7. **Long Pause:**
   - Watch video, pause for 35 minutes, resume
   - New session should start

## File Changes Summary

### `content.js`
- Add session state variables
- Add session management functions
- Modify time tracking to include session time
- Update UI to display session time
- Add periodic session expiration checks

### `background.js`
- Add session expiration check on startup
- Update daily reset to also reset session

### `styles.css`
- Add styles for session time display (if needed)

### Storage Schema
- Add `sessionTime` to `youtubeStats`
- Add `sessionState` object with `sessionStartTime`, `lastActivityTime`, `isActive`

## Performance Considerations

1. **Storage Writes:**
   - Limit storage writes to every 5-10 seconds when active
   - Write immediately on session start/end
   - Use `chrome.storage.local` (already in use)

2. **Interval Checks:**
   - Session expiration check: every 1-2 minutes (not every second)
   - Time tracking: every 1 second (existing, no change)

3. **Memory:**
   - Session state is minimal (3 values)
   - No significant memory impact

## Future Enhancements (Optional)

1. **Session History:**
   - Track multiple sessions per day
   - Show session count or average session length

2. **Configurable Cooldown:**
   - Allow users to configure cooldown period (default 30 min)

3. **Session Notifications:**
   - Notify user when session expires
   - Show session summary on expiration
