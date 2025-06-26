# Omnibox Testing Guide

## Features Implemented

### 1. **User Profile Session Partitioning**
- Each user profile gets its own Electron session partition (`persist:${profileId}`)
- Sessions are isolated - cookies, cache, and storage are separate per profile
- Default profile is created automatically on first run

### 2. **Navigation History Tracking**
- Automatically tracks all visited URLs with:
  - URL, title, timestamp
  - Visit count (increments on revisits)
  - Last visit time
  - Favicon (when available)
- History is persisted to disk and survives app restarts
- Limited to 1000 entries per profile for performance

### 3. **Omnibox Integration**
- History appears in autocomplete suggestions when typing
- Smart ranking algorithm:
  - Combines visit frequency with recency
  - More recent and frequently visited sites rank higher
- Shows visit count in suggestion description
- Falls back to saved contexts if profile history fails

### 4. **Enhanced Features**
- **Perplexity API Integration** (mocked): Shows Wikipedia, News, and Stack Overflow suggestions
- **Local Agent Integration** (mocked): Shows "Ask agent about X" suggestion
- **Virtualized Rendering**: Uses @tanstack/react-virtual for performant list rendering
- **Keyboard Navigation**:
  - Arrow keys: Navigate suggestions
  - Tab: Select highlighted suggestion
  - Enter: Navigate to selection
  - Escape: Close suggestions

## Testing Steps

1. **Test Navigation History**:
   - Navigate to several websites (e.g., google.com, github.com, stackoverflow.com)
   - Visit some sites multiple times
   - Close and reopen the app
   - Type partial URLs in the omnibox - history should appear

2. **Test Search Suggestions**:
   - Type a search query (e.g., "react hooks")
   - Should see:
     - Search suggestion at top
     - Perplexity suggestions (Wikipedia, News, Stack Overflow)
     - Agent suggestion at bottom

3. **Test Keyboard Navigation**:
   - Type to trigger suggestions
   - Use arrow keys to navigate
   - Press Tab on a suggestion
   - Press Escape to close

4. **Test Z-Index Fix**:
   - Open multiple browser tabs
   - Type in omnibox to show suggestions
   - Suggestions should appear above all browser content

## Debugging

- Profile data is stored at: `~/Library/Application Support/vibe/profiles.json`
- Check console for errors: View > Toggle Developer Tools
- Navigation history is logged when tracked

## Notes

- The Perplexity API integration is mocked - returns static suggestions
- The local agent integration is mocked - doesn't actually query the agent
- Real implementations would require:
  - Perplexity API key and endpoint
  - Agent service integration