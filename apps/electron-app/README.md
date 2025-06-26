# Electron App

The main desktop application built with Electron, React, and TypeScript.

## Development

```bash
# From the monorepo root
pnpm --filter @vibe/electron-app dev

# Or from this directory
pnpm dev
```

### Demo Mode

To always show the onboarding flow (useful for testing and demos):

```bash
DEMO_MODE=true pnpm dev
```

This will:
- Always treat the app as a first-time run
- Show the onboarding flow every time
- Skip creating the "has run before" marker

## Build

```bash
# For Windows
pnpm build:win

# For macOS
pnpm build:mac

# For Linux
pnpm build:linux
```

## Architecture

- **Main Process**: Handles system-level operations and window management
- **Renderer Process**: React application with TypeScript
- **Preload Scripts**: Secure bridge between main and renderer processes

## Technologies

- Electron
- React
- TypeScript
- Tailwind CSS
- Zustand (State Management)
- Ant Design (UI Components)
