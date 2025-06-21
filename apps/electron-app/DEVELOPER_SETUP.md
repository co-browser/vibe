# Vibe Electron App - Developer Setup & Architecture Guide

## Quick Start

### Prerequisites
- Node.js 18+ 
- PNPM (package manager)
- OpenAI API Key (for AI features)

### Initial Setup
```bash
# Clone and install dependencies
git clone <repository-url>
cd cursor-vibe
pnpm install

# Setup environment
cp apps/electron-app/.env.example apps/electron-app/.env
# Add your OPENAI_API_KEY to .env file

# Start development
pnpm --filter @vibe/electron-app dev
```

## Current Architecture Overview

### Process Architecture
```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Main Process  │◄──►│ Renderer Process│◄──►│  Utility Process│
│   (Backend)     │    │   (Frontend)    │    │  (AI Workers)   │
└─────────────────┘    └─────────────────┘    └─────────────────┘
        │                        │                        │
        ▼                        ▼                        ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   • Services    │    │   • React UI    │    │ • Agent Worker  │
│   • Browser     │    │   • Components  │    │ • MCP Worker    │
│   • IPC         │    │   • Hooks       │    │ • Processing    │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

### Main Process Structure
The main process coordinates everything:

#### Core Components
- **`src/main/index.ts`** - Application entry point (578 lines - needs simplification)
- **`src/main/browser/`** - Browser window/tab management (6 files - over-engineered)
- **`src/main/services/`** - Backend services (7 services, 70KB+ code)
- **`src/main/ipc/`** - Inter-process communication (20+ files - fragmented)

#### Key Services
- **AgentService** - AI agent coordination (588 lines)
- **GmailService** - Gmail integration (773 lines)
- **CDPService** - Chrome DevTools Protocol (514 lines)
- **MCPService** - Model Context Protocol
- **UpdateService** - Auto-updates

### Renderer Process Structure
The renderer handles the UI:

#### Core Components
- **`src/renderer/src/App.tsx`** - Root component
- **`src/renderer/src/components/`** - UI components (well-organized)
- **`src/renderer/src/hooks/`** - React hooks (11 hooks - some redundant)
- **`src/renderer/src/contexts/`** - React contexts

## Development Workflow

### Running the App
```bash
# Development mode (hot reload)
pnpm --filter @vibe/electron-app dev

# Build for production
pnpm --filter @vibe/electron-app build

# Package for distribution
pnpm --filter @vibe/electron-app dist
```

### Testing
```bash
# Type checking
pnpm --filter @vibe/electron-app typecheck

# Linting
pnpm --filter @vibe/electron-app lint

# Format code
pnpm --filter @vibe/electron-app format
```

## Key Architectural Patterns

### IPC Communication
```typescript
// Main Process Handler
ipcMain.handle('browser:create-tab', async (event, url) => {
  const browser = getBrowserInstance();
  return await browser.createTab(url);
});

// Renderer Process Call
const tabId = await window.vibe.browser.createTab('https://example.com');
```

### Service Pattern
```typescript
// All services follow this pattern
class SomeService extends EventEmitter {
  async initialize(): Promise<void> { /* setup */ }
  async terminate(): Promise<void> { /* cleanup */ }
  getStatus(): ServiceStatus { /* health check */ }
}
```

### Browser Management
```typescript
// Current (over-engineered) flow:
Browser → ApplicationWindow → WindowManager → TabManager → ViewManager

// Target (simplified) flow:
Browser → Window → Tab
```

## Common Development Tasks

### Adding New IPC Handler
1. Choose appropriate handler file (see consolidation plan)
2. Add handler function
3. Update type definitions in shared-types
4. Add renderer-side API wrapper

### Adding New Service
1. Implement BaseService interface
2. Register in ServiceRegistry
3. Add to initialization sequence
4. Add IPC handlers if needed

### Adding New UI Component
1. Create in appropriate `components/` subdirectory
2. Add to component exports
3. Update type definitions if needed
4. Add styles in corresponding CSS file

## Current Pain Points & Solutions

### 🔴 High Priority Issues

#### 1. Browser Management Complexity
**Problem**: 5 layers of abstraction for browser operations
```typescript
// Current: Too many layers
Browser.createWindow() 
  → WindowManager.createWindow()
    → ApplicationWindow.create()
      → TabManager.createTab()
        → ViewManager.createView()
```

**Solution**: Simplify to 3 layers (see Phase 1 of simplification plan)

#### 2. Service Complexity
**Problem**: AgentService is 588 lines, hard to maintain
**Solution**: Split into focused modules (Phase 2)

#### 3. IPC Fragmentation
**Problem**: 20+ small IPC files, hard to find functionality
**Solution**: Consolidate into 6 focused files (Phase 3)

### 🟡 Medium Priority Issues

#### 4. Startup Complexity
**Problem**: 578-line main process entry point
**Solution**: Extract initialization logic (Phase 4)

#### 5. Hook Proliferation
**Problem**: 11 custom hooks, some redundant
**Solution**: Consolidate related hooks (Phase 5)

## Working with the Simplification Plan

### Before Making Changes
1. Read the Architecture Analysis (`ARCHITECTURE_ANALYSIS.md`)
2. Follow the Implementation Checklist (`SIMPLIFICATION_CHECKLIST.md`)
3. Create feature branch: `feature/architecture-simplification`
4. Set up regression testing

### Implementation Guidelines
1. **Incremental Changes**: Never refactor more than one layer at a time
2. **Test Everything**: Ensure functionality works after each change
3. **Document Changes**: Update this guide as you simplify
4. **Measure Progress**: Track code reduction and complexity metrics

### Testing Strategy
```bash
# Before making changes
pnpm dev  # Ensure app starts
# Test all major features:
# - Window/tab management
# - Chat functionality  
# - Settings
# - Browser navigation

# After each change
pnpm typecheck  # No type errors
pnpm dev        # App still starts
# Regression test affected features
```

## Debugging Tips

### Main Process Debugging
```bash
# Enable debug logging
export LOG_LEVEL=debug
pnpm dev

# Use Chrome DevTools for main process
# Add --inspect flag to package.json dev script
```

### Renderer Process Debugging
- F12 opens DevTools in the app
- Use React DevTools extension
- Check Console for errors

### IPC Debugging
```typescript
// Add logging to IPC handlers
ipcMain.handle('some-channel', (event, ...args) => {
  console.log('IPC called:', 'some-channel', args);
  // ... handler logic
});
```

## Code Style & Conventions

### File Organization
- **Services**: One service per file, implement BaseService
- **IPC Handlers**: Group related handlers in single file
- **Components**: One component per file, co-locate styles
- **Utilities**: Pure functions, well-typed

### Naming Conventions
- **Files**: kebab-case (`user-service.ts`)
- **Classes**: PascalCase (`UserService`)
- **Methods**: camelCase (`getUserData`)
- **Constants**: SCREAMING_SNAKE_CASE (`MAX_RETRY_COUNT`)

### TypeScript Guidelines
- Use strict mode
- Prefer interfaces over types for object shapes
- Use proper generic constraints
- Avoid `any`, use `unknown` when needed

## Getting Help

### Resources
- **Architecture Analysis**: `ARCHITECTURE_ANALYSIS.md`
- **Implementation Checklist**: `SIMPLIFICATION_CHECKLIST.md`
- **Shared Types**: `packages/shared-types/src/`

### Common Issues
1. **App won't start**: Check environment variables, ensure OPENAI_API_KEY is set
2. **IPC errors**: Verify handler registration and type definitions
3. **Service errors**: Check service initialization order and dependencies
4. **Build errors**: Run `pnpm typecheck` to identify type issues

### Best Practices
- Always test changes thoroughly
- Update documentation when making architectural changes
- Use feature flags for risky changes
- Keep pull requests focused and small
- Write clear commit messages

---

**Remember**: The goal is to simplify while maintaining functionality. When in doubt, prefer clarity over cleverness.