# Profile Service Implementation

This document describes the comprehensive profile service implementation for Vibe Browser, including encrypted storage, session management, and onboarding integration.

## Overview

The Profile Service provides:

- **User Profile Management**: Create, update, delete, and switch between user profiles
- **Encrypted Storage**: Profile-specific encrypted data storage using custom encryption keys
- **Session Management**: Isolated Electron sessions for each profile with `persist:` partitions
- **Data Import**: Browser password and history import during onboarding
- **Generic Storage Interface**: Flexible storage for passwords, history, chat queries, and custom data

## Architecture

### Core Components

1. **ProfileService** (`profile-service.ts`)

   - Main service class managing all profile operations
   - Singleton pattern for global access
   - Event-driven architecture for profile state changes

2. **Enhanced Encrypted Storage** (`persistent/index.ts`)

   - Extended electron-store with custom encryption
   - Profile-specific encryption keys (hash of "cobro" + timestamp)
   - Dual-layer encryption: system + custom key

3. **Onboarding Integration** (`browser/onboarding-window.ts`)
   - Profile creation during first-time setup
   - Browser data import functionality
   - Session creation with proper partitioning

## Key Features

### Profile Management

```typescript
// Create a new profile
const profile = await profileService.createProfile(
  "John Doe",
  "john@example.com",
  {
    theme: "dark",
    privacyMode: true,
    autoSavePasswords: true,
  },
);

// Switch profiles
await profileService.switchProfile(profile.id);

// Get current profile
const currentProfile = profileService.getCurrentProfile();
```

### Encrypted Storage

Each profile gets its own encrypted store with a unique encryption key:

```typescript
// Encryption key generation
const encryptionKey = generateProfileEncryptionKey(timestamp);
// Result: SHA256 hash of "cobro" + timestamp

// Profile-specific store creation
const store = createProfileStore(profileId, encryptionKey);
```

### Session Management

Profiles use isolated Electron sessions with `persist:` partitions:

```typescript
// Session partition format
const sessionPartition = `persist:profile-${profileId}`;

// Session creation
const session = session.fromPartition(sessionPartition, { cache: true });
```

### Data Storage

The service provides structured storage for various data types:

```typescript
interface ProfileStorage {
  passwords: ImportedPassword[]; // Encrypted password storage
  history: HistoryEntry[]; // Browsing history
  chatQueries: ChatQueryData[]; // Chat autocomplete data
  bookmarks: any[]; // Browser bookmarks
  cookies: any[]; // Session cookies
  localStorage: Record<string, any>; // Local storage data
  sessionStorage: Record<string, any>; // Session storage data
  customData: Record<string, any>; // Generic key-value storage
}
```

## Security Features

### Encryption

1. **System-level encryption**: Uses Electron's `safeStorage` API
2. **Custom encryption layer**: Additional XOR encryption with profile-specific key
3. **Key derivation**: `SHA256("cobro" + timestamp)` for unique profile keys

### Session Isolation

- Each profile has its own session partition
- Isolated cookies, localStorage, and sessionStorage
- Separate cache and user data directories

### Permission Management

- Configurable permission handlers per profile
- Security headers injection
- Content Security Policy enforcement

## Usage Examples

### Basic Profile Operations

```typescript
import {
  getProfileService,
  initializeProfileService,
} from "./services/profile-service";

// Initialize the service
const profileService = await initializeProfileService();

// Create a profile
const profile = await profileService.createProfile(
  "Alice",
  "alice@example.com",
);

// Import passwords
await profileService.importPasswords(profile.id, [
  {
    url: "https://example.com",
    username: "alice",
    password: "encrypted_password",
    source: "chrome",
  },
]);

// Add browsing history
await profileService.addHistoryEntry(profile.id, {
  url: "https://example.com",
  title: "Example Site",
  visitCount: 1,
  lastVisit: new Date(),
});

// Store custom data
await profileService.setCustomData(profile.id, "preferences", {
  theme: "dark",
  notifications: true,
});
```

### Onboarding Integration

```typescript
// In onboarding window
ipcMain.handle("onboarding:complete", async (event, data: OnboardingData) => {
  // Create profile with onboarding data
  const profile = await profileService.createProfile(
    data.profileName,
    data.email,
    {
      theme: data.theme,
      privacyMode: data.privacyMode,
      autoSavePasswords: data.importPasswords,
      syncBrowsingHistory: data.importHistory,
    },
  );

  // Import browser data if requested
  if (data.importPasswords && data.selectedBrowser) {
    await importBrowserPasswords(profile.id, data.selectedBrowser);
  }

  return { success: true, profileId: profile.id };
});
```

## File Structure

```
apps/electron-app/src/main/
├── services/
│   ├── profile-service.ts          # Main profile service
│   └── README.md                   # This documentation
├── persistent/
│   └── index.ts                    # Enhanced encrypted storage
└── browser/
    └── onboarding-window.ts        # Onboarding integration
```

## Events

The ProfileService emits the following events:

- `profileCreated`: When a new profile is created
- `profileUpdated`: When profile data is modified
- `profileDeleted`: When a profile is removed
- `profileSwitched`: When switching between profiles
- `sessionCreated`: When a new session is established
- `dataImported`: When data is imported into a profile

## Error Handling

The service includes comprehensive error handling:

- Profile not found errors
- Encryption/decryption failures
- Session creation issues
- Storage access problems
- Data import failures

## Performance Considerations

- Lazy loading of profile stores
- Efficient session reuse
- Minimal memory footprint per profile
- Optimized data structures for large datasets

## Future Enhancements

Potential improvements for the profile service:

1. **Cloud Sync**: Synchronize profiles across devices
2. **Backup/Restore**: Profile data backup and restoration
3. **Advanced Import**: Support for more browsers and data types
4. **Profile Templates**: Pre-configured profile templates
5. **Analytics**: Usage tracking and insights per profile

## Integration Points

The profile service integrates with:

- **Browser Windows**: Session assignment for web content
- **Settings Management**: Profile-specific preferences
- **Chat System**: Query autocomplete and history
- **Password Manager**: Secure credential storage
- **History Management**: Browsing history tracking

This implementation provides a robust foundation for multi-user support in Vibe Browser with strong security and privacy guarantees.
