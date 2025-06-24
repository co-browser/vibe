# Store Documentation

This directory contains the store implementation for the Vibe Electron app, providing both in-memory state management and persistent desktop storage.

## Files

- `create.ts` - Zustand store creation and initial state
- `store.ts` - Main store interface and operations
- `types.ts` - TypeScript type definitions for the app state
- `index.ts` - Main exports for the store
- `desktop-store.ts` - **NEW** Persistent desktop storage using electron-store

## Desktop Store (`desktop-store.ts`)

The desktop store provides persistent storage for application settings and data using `electron-store` with optional encryption via Electron's `safeStorage`.

### Features

- **Persistent Storage**: Data persists between app restarts
- **Type Safety**: Full TypeScript support with typed keys and values
- **Encrypted Storage**: Secure storage for sensitive data using Electron's safeStorage
- **Default Values**: Automatic fallback to sensible defaults

### Usage

```typescript
import { 
  setUpdateSettings, 
  getUpdateSettings, 
  setSecureItem, 
  getSecureItem 
} from '@/store';

// Store update settings
setUpdateSettings({ useTestFeedUrl: true });
const settings = getUpdateSettings();

// Store encrypted data
setSecureItem('api-key', 'your-secret-api-key');
const apiKey = getSecureItem('api-key');
```

### Available Store Keys

| Key | Type | Description | Default |
|-----|------|-------------|---------|
| `UpdateSettings` | `IDesktopVibeUpdateSettings` | App update configuration | `{ useTestFeedUrl: false }` |
| `Theme` | `string` | Application theme | `'system'` |
| `Language` | `string` | Application language | `'en'` |
| `DevTools` | `boolean` | Developer tools enabled | `false` |
| `WinBounds` | `Electron.Rectangle` | Window position and size | `undefined` |
| `EncryptedData` | `Record<string, string>` | Encrypted key-value pairs | `{}` |
| `DisableKeyboardShortcuts` | `{ disableAllShortcuts: boolean }` | Keyboard shortcuts config | `{ disableAllShortcuts: false }` |
| `ASCFile` | `string` | ASC file path | `''` |
| `UpdateBuildNumber` | `string` | Current build number | `''` |

### Secure Storage Functions

- `setSecureItem(key: string, value: string)` - Store encrypted data
- `getSecureItem(key: string)` - Retrieve encrypted data
- `deleteSecureItem(key: string)` - Remove encrypted data

### Utility Functions

- `clear()` - Clear all stored data
- `instance` - Direct access to the electron-store instance

### Security Notes

- Secure storage requires `safeStorage.isEncryptionAvailable()` to return `true`
- If encryption is not available, secure storage functions will log errors and return `undefined`
- Encrypted data is stored as hex strings in the main encrypted data object

## Migration from Previous Store

The desktop store is designed to work alongside the existing Zustand store. The Zustand store continues to handle in-memory application state, while the desktop store handles persistent settings and configuration.

### Example Integration

```typescript
// In your application code
import { mainStore } from '@/store';
import { getTheme, setTheme } from '@/store';

// Get theme from persistent storage
const theme = getTheme();

// Update both in-memory and persistent storage
mainStore.setState({ theme });
setTheme(theme);
``` 