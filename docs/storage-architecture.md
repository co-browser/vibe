# Storage and Agent Process Architecture

## Overview

Vibe uses a unified `StorageService` for all persistent data, including application settings and user profile data. All sensitive data is automatically encrypted by the `StorageService`. The `ProfileService` is a higher-level service that leverages the `StorageService` to manage user-specific data.

The Agent, which handles core AI functionality, runs in a separate, isolated utility process to ensure stability and security. This process communicates with the main process via IPC to access necessary data, like API keys, from the `StorageService`.

## Architecture Diagram

```
┌──────────────────┐      ┌───────────────────┐      ┌──────────────────┐
│   Main Process   │      │  Utility Process  │      │ Renderer Process │
├──────────────────┤      ├───────────────────┤      ├──────────────────┤
│                  │      │                   │      │                  │
│┌───────────────┐ │      │ ┌───────────────┐ │      │  ┌────────────┐  │
││ StorageService│ │      │ │ Agent Process │ │      │  │     UI     │  │
│└───────┬───────┘ │      │ └───────┬───────┘ │      │  └─────┬──────┘  │
│        │         │      │         │         │      │        │         │
│┌───────▼───────┐ │      │         │         │      │  ┌─────▼──────┐  │
││ ProfileService│ │      │         │         │      │  │ Settings UI│  │
│└───────┬───────┘ │      │         │         │      │  └─────┬──────┘  │
│        │         │      │         │         │      │        │         │
│┌───────▼───────┐ │      │         │         │      │        │         │
││ IPC Handlers  │◄─┐   ┌──►│ IPC Listener  │ │      │  ┌─────▼──────┐  │
││(settings, etc)│ │   │   │ (agent events)│ │      │  │   Preload  │  │
│└─────��─┬───────┘ │   │   └───────────────┘ │      │  └─────┬──────┘  │
│        │         │   │                     │      │        │         │
└────────┼─────────┘   │                     └──────┼────────┼─────────┘
         │             │                            │        │
         └─────────────┼────────────────────────────┘        │
                       │                                    │
                       └────────────────────────────────────┘
```

## Storage Keys

All data is stored as key-value pairs by the `StorageService`. Keys are typically prefixed to indicate their purpose.

### App Settings (Managed directly by `StorageService`)
- `settings.theme` - UI theme preference
- `settings.language` - Application language
- `settings.devTools` - Developer tools enabled
- `settings.windowBounds` - Window position/size
- `settings.openaiApiKey` - The user's OpenAI API key (encrypted)

### Profile Data (Managed by `ProfileService` via `StorageService`)
- `profiles` - A map of all user profiles (metadata)
- `profile.{id}.history` - Browsing history for a specific profile
- `profile.{id}.preferences` - User-specific preferences for a specific profile

## Agent Process Lifecycle and API Key Handling

The agent's lifecycle is designed to be robust and secure, allowing it to start without an API key and wait until one is provided.

1.  **Process Start**: The `agent-process` is launched by the main process.
2.  **Environment Check**: It immediately checks for an `OPENAI_API_KEY` environment variable. If present, the agent initializes with it.
3.  **Waiting State**: If the key is not found in the environment, the process enters a `waiting_for_api_key` state. It is running but the core `Agent` class is not yet instantiated.
4.  **IPC Initialization**: The main process sends an `initialize` IPC message with the rest of the configuration (e.g., model, processor type).
5.  **API Key Update**: The API key can be provided in two ways:
    *   **Via Profile Service**: When a user adds or changes their API key in the settings UI, the `ProfileService` saves it to the `StorageService`. This triggers a `settings:changed` event.
    *   **Directly via IPC**: An `update-openai-api-key` message can be sent.
6.  **Agent Creation**: Once the API key is received (from any source), the `Agent` class is finally instantiated, and the process becomes fully `ready`.

This flow ensures the agent process never has to directly access the file system or settings store, adhering to security best practices.

## Data Flow: Profile Service to Agent

Here is the step-by-step data flow for updating the agent with a new API key from the UI:

1.  **User Action**: The user enters their OpenAI API key in the settings page (Renderer Process).
2.  **IPC to Main**: The UI sends an IPC message (`settings:set`) to the Main Process with the new key.
3.  **Storage Update**: The `settings-handlers` in the Main Process receives the message and tells the `StorageService` to save the key to `settings.openaiApiKey`.
4.  **Storage Event**: The `StorageService` successfully saves the key and emits a `change` event.
5.  **IPC to Agent Process**: The `process-storage-handler` (which was set up when the agent process was created) is listening for these storage events. It catches the change to `settings.openaiApiKey` and forwards it to the `agent-process` via a `settings:changed` IPC message.
6.  **Agent Update**: The `agent-process` receives the `settings:changed` message. Its IPC listener identifies the key update and calls its internal `handleUpdateOpenAIApiKey` function.
7.  **Agent Ready**: The agent is created or updated with the new key and is now fully operational.

## Development Tools

```bash
# Inspect storage contents
pnpm storage:inspect

# View raw data (secure values hidden)
pnpm storage:inspect:raw

# Delete all storage (dev only)
pnpm storage:delete
```

## Profile Management

### Current Model: Single Active Profile

The current architecture supports multiple user profiles but operates with a single active profile at any given time. This was a deliberate design choice to simplify the user experience and the underlying data management.

- **How it Works**: The `ProfileService` maintains a `currentProfileId`. All operations related to profile-specific data (e.g., browsing history, preferences) use this ID to read from and write to the correct storage keys (e.g., `profile.{id}.history`). When a user switches profiles via the `setActiveProfile` method, the `currentProfileId` is updated, and all subsequent operations target the new profile's data.

- **Global API Key**: A key aspect of this simplified model is the use of a single, global OpenAI API key stored in `settings.openaiApiKey`. This key is used by the agent regardless of which profile is active.

### Future Enhancement: Multi-Profile API Keys

To extend the system to support different API keys for different profiles, the following changes would be needed:

1.  **Re-introduce Profile-Specific Key Storage**:
    *   The `ProfileService` would need to be updated to manage API keys on a per-profile basis. This would involve re-introducing a storage key like `secure.profile.{id}.apiKeys`.
    *   The UI would need to be updated to allow users to set API keys within the context of a specific profile.

2.  **Update Agent Initialization**:
    *   When the agent process is initialized or a profile is switched, the main process would need to send the API key for the *active* profile to the agent process.

3.  **Handle Profile Switching in the Agent**:
    *   The `agent-process` would need a new IPC handler to listen for profile switch events.
    *   When a profile switch occurs, the main process would send an IPC message to the agent process with the new profile's API key. The agent would then re-initialize its processor with the new key.

This approach would restore the multi-profile API key functionality while building on the existing, robust profile management system.
