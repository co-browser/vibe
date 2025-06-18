# Contributing to Vibe

Thank you for your interest in contributing to Vibe! This document provides guidelines and information for contributors.

## 🚀 Getting Started

### Prerequisites

- Node.js 18.0.0 or higher
- pnpm 9.0.0 or higher
- Python 3.10 (for MCP servers)
- Git

### Development Setup

1. **Clone the repository:**
   ```bash
   git clone https://github.com/co-browser/vibe.git
   cd vibe
   ```

2. **Install dependencies:**
   ```bash
   pnpm install
   ```

3. **Set up environment variables:**
   ```bash
   cp .env.example .env
   # Edit .env with your API keys and configuration
   ```

4. **Start development:**
   ```bash
   pnpm dev
   ```

## 📁 Project Structure

```
vibe/
├── apps/
│   ├── electron-app/          # Main Electron application
│   └── mcp-server/            # MCP server implementations
├── packages/
│   ├── agent-core/            # Core agent functionality
│   ├── shared-types/          # Shared TypeScript types
│   └── tab-extraction-core/   # Tab content extraction
├── scripts/                   # Development scripts
└── .github/                   # GitHub workflows and templates
```

## 🧑‍💻 Development Guidelines

### Code Style

- **TypeScript**: Use TypeScript for all new code
- **ESLint**: Code must pass ESLint checks (`pnpm lint`)
- **Prettier**: Code must be formatted with Prettier (`pnpm format`)
- **Conventional Commits**: Use conventional commit messages

### Commit Messages

We use [Conventional Commits](https://www.conventionalcommits.org/) for automatic versioning:

- `feat:` - New features (minor version bump)
- `fix:` - Bug fixes (patch version bump)
- `docs:` - Documentation changes
- `style:` - Code style changes (formatting, etc.)
- `refactor:` - Code refactoring
- `test:` - Adding or updating tests
- `chore:` - Maintenance tasks

Examples:
```bash
feat: add new tab automation features
fix: resolve memory leak in agent service
docs: update installation instructions
```

### Testing

- Write tests for new functionality
- Ensure all tests pass: `pnpm test`
- Add integration tests for complex features

### TypeScript

- Use strict TypeScript configuration
- Add proper type annotations
- Avoid `any` types when possible
- Check types with: `pnpm typecheck`

## 🔧 Available Scripts

```bash
# Development
pnpm dev                    # Start development environment
pnpm build                  # Build all packages
pnpm build:mac/win/linux   # Build platform-specific distributions

# Quality Assurance
pnpm lint                   # Lint code
pnpm lint:fix              # Fix linting issues
pnpm format                # Format code with Prettier
pnpm typecheck             # Check TypeScript types
pnpm test                  # Run tests

# Maintenance
pnpm clean                 # Clean build artifacts
pnpm setup                 # Initial setup with submodules
```

## 🐛 Reporting Issues

When reporting issues, please include:

1. **Environment information:**
   - Operating system and version
   - Node.js and pnpm versions
   - Electron app version

2. **Steps to reproduce:**
   - Clear, step-by-step instructions
   - Expected vs actual behavior
   - Screenshots or logs if relevant

3. **Additional context:**
   - Error messages
   - Relevant configuration
   - Recent changes or updates

## 💡 Feature Requests

For feature requests:

1. **Check existing issues** to avoid duplicates
2. **Describe the problem** the feature would solve
3. **Provide use cases** and examples
4. **Consider implementation** and potential challenges

## 🔀 Pull Request Process

1. **Fork and branch:**
   ```bash
   git checkout -b feat/your-feature-name
   ```

2. **Make your changes:**
   - Follow coding standards
   - Add tests if applicable
   - Update documentation

3. **Test your changes:**
   ```bash
   pnpm lint
   pnpm typecheck
   pnpm test
   pnpm build
   ```

4. **Commit with conventional messages:**
   ```bash
   git commit -m "feat: add amazing new feature"
   ```

5. **Push and create PR:**
   - Push to your fork
   - Create a pull request
   - Fill out the PR template
   - Link related issues

### PR Requirements

- ✅ Code passes all checks (lint, typecheck, tests)
- ✅ Conventional commit messages
- ✅ Updated documentation (if applicable)
- ✅ Tests added for new functionality
- ✅ No breaking changes (unless discussed)

## 🏗️ Architecture Overview

### Core Components

- **Electron App**: Main desktop application with React frontend
- **Agent Core**: AI-powered automation engine
- **MCP Services**: Model Context Protocol server implementations
- **Tab Extraction**: Browser tab content processing

### Key Technologies

- **Frontend**: React 19, TypeScript, Tailwind CSS
- **Backend**: Electron, Node.js, Python
- **AI/ML**: OpenAI SDK, LangChain, MCP
- **Build Tools**: Electron Vite, Turbo, PNPM

## 🤝 Community Guidelines

- **Be respectful** and inclusive
- **Help others** learn and grow
- **Ask questions** if something is unclear
- **Share knowledge** and best practices
- **Provide constructive feedback**

## 📄 License

This project has no license specified. Please respect the intellectual property and contribution terms.

## 📞 Getting Help

- **Documentation**: Check the README and docs
- **Issues**: Search existing GitHub issues
- **Community**: Join our Discord server (link in README)
- **Email**: Contact the maintainers

---

**Thank you for contributing to Vibe!** 🚀