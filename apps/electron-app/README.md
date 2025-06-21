# Vibe Electron App

AI-powered browser automation and management tool built with Electron, React, and TypeScript.

## 🚀 Quick Start

```bash
# Install dependencies
pnpm install

# Setup environment
cp .env.example .env
# Add your OPENAI_API_KEY to .env file

# Start development
pnpm dev
```

## 📋 Architecture & Simplification

This project is currently undergoing an architecture simplification effort to improve maintainability and developer experience.

### 📖 Documentation
- **[Developer Setup Guide](./DEVELOPER_SETUP.md)** - Complete setup and development guide
- **[Architecture Analysis](./ARCHITECTURE_ANALYSIS.md)** - Detailed architecture review and simplification plan
- **[Implementation Checklist](./SIMPLIFICATION_CHECKLIST.md)** - Step-by-step implementation tasks

### 🎯 Current Status
- **Current State**: Feature-complete but complex (70+ files, multiple abstraction layers)
- **Target State**: Simplified architecture with 25-30% code reduction
- **Timeline**: 7-week incremental improvement plan

### 🔧 Key Improvements Planned
1. **Browser Management**: Reduce from 5 layers to 3 layers of abstraction
2. **Service Layer**: Split large services into focused modules
3. **IPC Handlers**: Consolidate 20+ files into 6 focused files
4. **Main Process**: Simplify 578-line entry point
5. **Documentation**: Comprehensive API and architecture docs

## 🏗️ Architecture Overview

### Process Structure
```
Main Process (Node.js)     Renderer Process (React)     Utility Process (Workers)
├── Services              ├── Components                ├── Agent Worker
├── Browser Management    ├── Hooks                     ├── MCP Worker
├── IPC Handlers          ├── Pages                     └── Processing Logic
└── Initialization        └── Contexts
```

### Key Technologies
- **Electron** - Desktop app framework
- **React** - UI framework
- **TypeScript** - Type safety
- **Vite** - Build tool
- **Tailwind** - Styling
- **Zustand** - State management

## 📦 Project Structure

```
src/
├── main/                 # Main process (Node.js backend)
│   ├── browser/         # Browser window/tab management
│   ├── services/        # Backend services (Agent, Gmail, etc.)
│   ├── ipc/            # Inter-process communication
│   └── index.ts        # Application entry point
├── renderer/           # Renderer process (React frontend)
│   └── src/
│       ├── components/ # UI components
│       ├── hooks/      # React hooks
│       ├── pages/      # Route components
│       └── contexts/   # React contexts
└── preload/           # Preload scripts
```

## 🚀 Development

### Available Scripts
```bash
pnpm dev          # Start development server
pnpm build        # Build for production
pnpm dist         # Package for distribution
pnpm typecheck    # Type checking
pnpm lint         # Linting
pnpm format       # Code formatting
```

### Environment Variables
```bash
OPENAI_API_KEY=your-openai-api-key  # Required for AI features
LOG_LEVEL=info                      # Logging level (debug, info, warn, error)
NODE_ENV=development                # Environment mode
```

## 🔍 Key Features

### Browser Automation
- Multi-tab browser interface
- Chrome DevTools Protocol integration
- Page content extraction
- Navigation automation

### AI Integration
- OpenAI GPT integration
- Model Context Protocol (MCP) support
- Streaming chat interface
- Agent-based automation

### Gmail Integration
- OAuth authentication
- Email reading and composition
- Attachment handling
- Contact management

### Advanced Features
- Auto-updates
- Session persistence
- Error tracking with Sentry
- Memory monitoring

## 🧪 Testing

### Manual Testing Checklist
- [ ] Application starts without errors
- [ ] Window/tab creation and navigation
- [ ] Chat interface functionality
- [ ] Settings management
- [ ] Gmail integration (if configured)

### Debugging
```bash
# Enable debug logging
export LOG_LEVEL=debug
pnpm dev

# Main process debugging
# Add --inspect flag to dev script in package.json

# Renderer debugging
# Press F12 in the app to open DevTools
```

## 🤝 Contributing

### Before Contributing
1. Read the [Developer Setup Guide](./DEVELOPER_SETUP.md)
2. Review the [Architecture Analysis](./ARCHITECTURE_ANALYSIS.md)
3. Follow the [Implementation Checklist](./SIMPLIFICATION_CHECKLIST.md) for architectural changes

### Development Guidelines
- Use TypeScript for all new code
- Follow the existing code style and conventions
- Write comprehensive tests for new features
- Update documentation for architectural changes
- Keep pull requests focused and small

### Architecture Changes
If you're working on the simplification effort:
1. Create a feature branch: `feature/architecture-simplification`
2. Follow the phased approach outlined in the checklist
3. Test thoroughly after each change
4. Update documentation as you go

## 📝 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🆘 Getting Help

### Common Issues
- **App won't start**: Check environment variables, ensure OPENAI_API_KEY is set
- **Build errors**: Run `pnpm typecheck` to identify type issues
- **IPC errors**: Verify handler registration in main process

### Resources
- [Electron Documentation](https://www.electronjs.org/docs)
- [React Documentation](https://react.dev)
- [TypeScript Documentation](https://www.typescriptlang.org/docs)

---

**Note**: This project is actively being simplified and improved. See the architecture documentation for detailed information about ongoing improvements.
