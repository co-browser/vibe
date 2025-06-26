# Utility Process Settings Access

This document describes how utility processes in the Vibe electron app can access and watch settings.

## Overview

Utility processes (like the agent process and MCP manager) can now access user settings and profile information through a dedicated settings API. This allows them to:

- Read settings values
- Write settings values
- Watch for settings changes
- Get the current profile ID

## Setup

The settings access is automatically set up when creating a utility process. The main process calls `setupUtilityProcessSettings()` when forking a new utility process.

## Usage in Utility Processes

### Import the Settings Handler

```typescript
import { UtilityProcessSettings } from "./utility-settings-handler";
```

### Reading Settings

```typescript
// Get a specific setting
const theme = await UtilityProcessSettings.get<string>("theme");
const temperature = await UtilityProcessSettings.get<number>("temperature");

// Get all settings (masked for security)
const allSettings = await UtilityProcessSettings.getAll();
```

### Writing Settings

```typescript
// Set a setting value
const success = await UtilityProcessSettings.set("temperature", 0.8);
```

### Getting Current Profile

```typescript
// Get the current profile ID
const profileId = await UtilityProcessSettings.getCurrentProfileId();
```

### Watching for Changes

```typescript
// Watch for changes to a specific setting
const unwatch = UtilityProcessSettings.watch("model", (newValue, oldValue) => {
  console.log(`Model changed from ${oldValue} to ${newValue}`);
});

// Stop watching (optional - automatically cleaned up on process exit)
unwatch();
```

## Example: Agent Process

Here's how the agent process uses settings:

```typescript
static async handleInitialize(message: BaseMessage): Promise<void> {
  // Get temperature from user settings
  const temperature = await UtilityProcessSettings.get<number>("temperature") || 0.7;
  
  // Get current profile
  const profileId = await UtilityProcessSettings.getCurrentProfileId();
  console.log(`Initializing for profile: ${profileId}`);
  
  // Watch for model changes
  UtilityProcessSettings.watch("model", (newModel, oldModel) => {
    console.log(`Model changed from ${oldModel} to ${newModel}`);
    // Could reinitialize agent with new model
  });

  // Create agent with settings
  agent = AgentFactory.create({
    openaiApiKey: config.openaiApiKey,
    model: config.model || "gpt-4o-mini",
    temperature, // Use temperature from settings
  });
}
```

## Security

- Sensitive settings (API keys, tokens) are automatically masked when retrieved via `getAll()`
- Settings changes for sensitive data only notify that a change occurred, not the actual values
- Each utility process can only access settings for the current profile

## Implementation Details

1. **Main Process Side** (`utility-process-settings.ts`):
   - Handles IPC messages from utility processes
   - Accesses the actual stores (settingsStore, secureStore, userDataStore)
   - Sets up watchers for store changes
   - Forwards changes to utility processes

2. **Utility Process Side** (`utility-settings-handler.ts`):
   - Provides async API for settings access
   - Communicates with main process via IPC
   - Manages callbacks for watched settings
   - Automatically initializes when imported

3. **Automatic Setup**:
   - `AgentWorker` and `MCPWorker` automatically call `setupUtilityProcessSettings()`
   - Settings access is available immediately after process creation
   - Watchers are automatically cleaned up on process exit