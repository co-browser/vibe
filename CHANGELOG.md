
<a name="v0.1.7"></a>
## [v0.1.7] - 2025-07-10
### Fix
- prevent Gmail MCP server orphaned processes on app quit

### Pull Requests
- Merge pull request [#73](https://github.com/co-browser/vibe/issues/73) from co-browser/fix/gmail-mcp-process-cleanup


<a name="v0.1.6"></a>
## [v0.1.6] - 2025-07-10
### Chore
- update README.md to clarify AI feature description
- update README.md title for clarity
- update README.md to enhance project description and clarify setup instructions
- **oauth-proxy:** prepare v1.1.4 release
- **release:** v0.1.6

### Feat
- add cloud-based OAuth proxy server for Gmail authentication
- enhance copy button error handling and memory safety
- improve copy button accessibility
- add copy button to assistant messages

### Fix
- ensure Gmail MCP server works in production builds
- improve Gmail auth token handling and caching
- remove unhandled gmail-tokens-update message and fix token update logic
- prevent Gmail MCP from reading local credentials when USE_LOCAL_GMAIL_AUTH is false
- prevent Gmail MCP from reading local credentials when USE_LOCAL_GMAIL_AUTH is false
- **mcp-gmail:** improve IPC message handling with type safety and validation
- **mcp-manager:** add break statement to prevent switch case fallthrough
- **oauth-proxy:** restrict postMessage target origin for security
- **oauth-proxy:** defer session destruction after token exchange
- **oauth-proxy:** fix critical XSS vulnerability in error page
- **oauth-proxy:** remove third-party crypto dependency - CRITICAL SECURITY FIX
- **oauth-proxy:** update rate limiter key generator to use non-deprecated API
- **oauth-proxy:** implement stricter endpoint-specific rate limiting
- **oauth-proxy:** sanitize sensitive data in request logging
- **security:** enforce HTTPS validation on OAuth server URLs
- **ui:** set chat panel to be open by default on startup
- **window:** resolve window lifecycle and control issues

### Refactor
- flatten infrastructure directory structure
- **mcp-gmail:** enhance local authentication handling for Gmail

### Pull Requests
- Merge pull request [#70](https://github.com/co-browser/vibe/issues/70) from co-browser/feat/cloud-oauth-proxy
- Merge pull request [#71](https://github.com/co-browser/vibe/issues/71) from co-browser/add-claude-github-actions-1751969875826
- Merge pull request [#68](https://github.com/co-browser/vibe/issues/68) from co-browser/fix/chat-copy-paste-formatting
- Merge pull request [#67](https://github.com/co-browser/vibe/issues/67) from co-browser/fix/chat-window-default-open
- Merge pull request [#66](https://github.com/co-browser/vibe/issues/66) from co-browser/fix/window-lifecycle-and-controls

### BREAKING CHANGE

Gmail authentication now uses cloud OAuth by default. Users can opt-in to local OAuth with USE_LOCAL_GMAIL_AUTH=true

🤖 Generated with [Claude Code](https://claude.ai/code)


<a name="v0.1.5"></a>
## [v0.1.5] - 2025-07-07
### Chore
- **release:** v0.1.5

### Fix
- enable remote RAG server connection and update build assets

### Pull Requests
- Merge pull request [#62](https://github.com/co-browser/vibe/issues/62) from co-browser/fix/remote-rag-connection


<a name="v0.1.4"></a>
## [v0.1.4] - 2025-07-05
### Chore
- **release:** v0.1.4

### Feat
- add workflow_dispatch support to release workflow
- **api-profile-storage:** dynamic agent restart on API key changes

### Fix
- format code to pass CI checks
- agent loading spinner shows correct status

### Refactor
- improve event listener management in AgentService and enhance signal handling in dev.js

### Pull Requests
- Merge pull request [#50](https://github.com/co-browser/vibe/issues/50) from co-browser/feat/api-profile-storage
- Merge pull request [#53](https://github.com/co-browser/vibe/issues/53) from co-browser/maceip-patch-1
- Merge pull request [#52](https://github.com/co-browser/vibe/issues/52) from co-browser/fix/agent-loading-spinner


<a name="v0.1.3"></a>
## [v0.1.3] - 2025-07-03
### Chore
- simplify Docker release workflow by removing push trigger and unnecessary whitespace
- simplify Docker release workflow by removing Node.js setup and build steps
- enhance Docker release workflow and add simple Dockerfile
- **release:** remove main branch from push triggers in release workflow
- **release:** update release workflow
- **release:** v0.1.3

### Feat
- add persistent desktop store with Touch ID  authentication
- add persistent desktop store with Touch ID  authentication

### Fix
- add persist-credentials false to checkout step
- stop audio playback when closing tabs
- enhance desktop store security
- update Dockerfile to include legacy flag for deployment
- update Docker release workflow to use conditional token for authentication
- update Dockerfile to handle workspace dependencies correctly
- **build:** resolve Node.js module warnings in shared-types
- **mcp-rag:** implement user namespace isolation

### Refactor
- remove redundant keychain password storage
- optimize Dockerfile for multi-stage build and improved deployment
- improve Dockerfile for targeted builds and dependency management
- enhance Dockerfile for simplified dependency management and build process
- optimize Dockerfile for targeted dependency installation and build process
- optimize Dockerfile for dependency installation and build process
- restructure Dockerfile for multi-stage build and improved dependency management
- update Dockerfile to improve package handling and remove workspace references
- simplify Docker release workflow and improve Coolify deployment logic
- **mcp-rag:** improve user context handling

### Pull Requests
- Merge pull request [#51](https://github.com/co-browser/vibe/issues/51) from co-browser/fix/rag-namespace-isolation
- Merge pull request [#49](https://github.com/co-browser/vibe/issues/49) from co-browser/fix/shared-types-node-modules-warning
- Merge pull request [#48](https://github.com/co-browser/vibe/issues/48) from co-browser/fix/audio-cleanup
- Merge pull request [#37](https://github.com/co-browser/vibe/issues/37) from co-browser/feat/store


<a name="v0.1.2"></a>
## [v0.1.2] - 2025-06-29
### Chore
- add CI and Docker release workflows
- update RAG server configuration to use structured environment variables
- enhance RAG server configuration and error handling
- update .gitignore to include CLAUDE.md
- add release workflow and update Electron app configuration
- refine environment configuration and improve RAG server handling
- update example environment configuration for RAG server
- clean up Dockerfile and improve command formatting
- remove deployment workflow and enhance Dockerfile metadata
- linting
- update postinstall script and remove versioning note from README
- **release:** v0.1.2

### Docs
- update README to enhance features section and clarify Gmail setup
- simplify features setup and highlight both core features
- add Gmail feature setup instructions

### Feat
- enhance deployment workflow and Dockerfile configuration
- add multi-platform Docker build support to RAG server workflow
- add error boundary and validation for PrivyProvider setup
- implement Privy authentication in RAG server
- add local RAG server configuration options
- implement secure context for WebCrypto API support
- implement dynamic OAuth authentication for cloud RAG server
- add Privy authentication for cloud RAG server
- add Privy authentication for cloud RAG server
- enhance Umami tracking with serialized event data
- improve Umami tool tracking with individual events
- implement custom hook for chat panel health monitoring
- enhance Window interface for Electron integration
- implement chat panel recovery system
- implement robust tab wake-up with comprehensive edge case handling
- add RAG MCP server implementation with environment configuration and tools

### Fix
- correct sed commands for workspace dependencies in Dockerfile
- update Dockerfile to build packages during Docker build
- correct release notes generation using GitHub API
- clean up scripts and workflows for professional standards
- resolve CI failures and workflow syntax issues
- update paths for notarization scripts in electron-builder configuration
- update release workflow and scripts for notarization
- disable auto-publish in electron-builder for releases
- update release workflow to use PAT
- use proper updateAuthToken method instead of type assertion in factory
- improve type safety by removing type assertion in Agent class
- improve security and race condition handling in PrivyAuthButton
- add error handling for production vibe:// protocol loading
- resolve concurrency issue by removing instance property for userId
- sanitize Privy user IDs for Turbopuffer namespace compatibility
- initialize global auth token for Privy authentication
- improve chat panel visibility checks in LayoutProvider
- update dependency in LayoutProvider effect to include chat panel visibility
- resolve tab wake-up failure due to undefined originalUrl property
- body of email missing -filter(boolean) was removing blank separator
- update pnpm version in workflows to match package.json (10.12.1)

### Refactor
- clean up workflows and fix release changelog generation
- revert commit 62d2484
- replace global auth token with secure AuthTokenManager
- simplify environment variable handling and hardcode Privy app ID
- implement type guard for chat panel state in LayoutProvider
- remove unused chat panel recovery animation styles
- replace arbitrary setTimeout with event-driven navigation cleanup
- clarify connectionAttempts property in MCP types
- update RAGIngestionResult and RAGQueryResult interfaces for consistency
- enhance RAGToolResponse interface for type safety
- improve graceful shutdown handling in MCP server
- update MCP manager and tool router descriptions
- streamline MCP manager and tool routing
- overhaul MCP connection management and tool routing
- enhance MCP server configuration management

### Pull Requests
- Merge pull request [#40](https://github.com/co-browser/vibe/issues/40) from co-browser/feature/privy-authentication
- Merge pull request [#39](https://github.com/co-browser/vibe/issues/39) from co-browser/feat/talkToTab
- Merge pull request [#34](https://github.com/co-browser/vibe/issues/34) from co-browser/feature/add-gmail-setup-docs
- Merge pull request [#33](https://github.com/co-browser/vibe/issues/33) from co-browser/feature/improve-umami-tool-tracking
- Merge pull request [#32](https://github.com/co-browser/vibe/issues/32) from co-browser/fix/renderer-mac-sleep-recovery
- Merge pull request [#30](https://github.com/co-browser/vibe/issues/30) from co-browser/fix/tab-sleep-originalurl-bug
- Merge pull request [#31](https://github.com/co-browser/vibe/issues/31) from co-browser/fix/gmail-mcp-send
- Merge pull request [#26](https://github.com/co-browser/vibe/issues/26) from co-browser/chore/docu-build-updates
- Merge pull request [#27](https://github.com/co-browser/vibe/issues/27) from co-browser/feat/mcp-utility-process
- Merge pull request [#25](https://github.com/co-browser/vibe/issues/25) from co-browser/fix/rag-server
- Merge pull request [#20](https://github.com/co-browser/vibe/issues/20) from co-browser/feat/rag-mcp-server


<a name="v0.1.1"></a>
## [v0.1.1] - 2025-06-20
### Chore
- add changelog template and configuration
- update Slack notification channel in workflow
- update Slack notification channel and log API response
- update actions/cache version in release workflow
- remove tsbuildinfo files from git tracking
- update .gitignore to exclude TypeScript build info files
- update dependencies in package.json and package-lock.json
- **release:** v0.1.1 [skip ci]
- **release:** update release workflow to generate and commit VERSION and CHANGELOG files

### Feat
- add GitHub Actions workflows for pull requests and pushes
- enhance release workflow with manual trigger and improved job structure
- enhance release workflow with automatic PR creation and version management
- add path utilities for improved file resolution in Node.js
- add automatic token refresh for Gmail OAuth client
- implement restart logic for MCP servers with attempt tracking
- implement health check for MCP server readiness
- add path validation for OAuth and credentials configuration in Gmail tools
- enhance Gmail tools with type safety and argument validation
- integrate Gmail MCP server with utility process architecture
- enhance Gmail MCP server with improved connection handling and graceful shutdown
- enhance GmailOAuthService with improved security and CORS handling
- Gmail MCP server with essential configuration and tools
- add public cleanup method for GmailOAuthService
- enhance Gmail OAuth flow with tab management and UI updates
- implement Gmail OAuth integration with ViewManager support
- remove python dependencies and services

### Fix
- update status logic in GitHub Actions workflows
- prevent infinite recursion in body extraction for Gmail tools
- enhance PATH configuration for cross-platform compatibility in MCPManager
- improve error handling for missing worker process file in MCPWorker
- improve error handling and logging for MCP service initialization
- correct variable declaration for server port in Gmail MCP server
- re-initialize AgentService with IPC integration and error handling
- process manager to differentiate between development and production environments

### Refactor
- streamline tool configuration in Gmail MCP server
- enhance bounds calculation in GmailOAuthService for clarity
- update bounds calculation in GmailOAuthService for improved layout management
- improve Gmail OAuth cleanup logic and state management
- streamline Gmail OAuth flow with ViewManager integration

### Pull Requests
- Merge pull request [#24](https://github.com/co-browser/vibe/issues/24) from co-browser/feat/rewrote-release
- Merge pull request [#23](https://github.com/co-browser/vibe/issues/23) from co-browser/fix/releaser-remove-dry-run
- Merge pull request [#22](https://github.com/co-browser/vibe/issues/22) from co-browser/fix/releaser
- Merge pull request [#21](https://github.com/co-browser/vibe/issues/21) from co-browser/fix/releaser
- Merge pull request [#18](https://github.com/co-browser/vibe/issues/18) from co-browser/feature/gmail-mcp-server
- Merge pull request [#16](https://github.com/co-browser/vibe/issues/16) from co-browser/1-feature-complete-gmail-integration-with-oauth-setup-and-email-sending-mcp-server
- Merge pull request [#13](https://github.com/co-browser/vibe/issues/13) from co-browser/add-acme-changes
- Merge pull request [#15](https://github.com/co-browser/vibe/issues/15) from co-browser/coderabbitai/docstrings/2XM8lHxxrBxVzcvxxek22f
- Merge pull request [#4](https://github.com/co-browser/vibe/issues/4) from co-browser/fix/mcp-dev-env-bootstrap


<a name="v0.1.0"></a>
## [v0.1.0] - 2025-06-13
### Chore
- **release:** 0.1.0 [skip ci]

### Feat
- initial alpha release


<a name="v0.0.0"></a>
## v0.0.0 - 2025-06-13

[v0.1.7]: https://github.com/co-browser/vibe/compare/v0.1.6...v0.1.7
[v0.1.6]: https://github.com/co-browser/vibe/compare/v0.1.5...v0.1.6
[v0.1.5]: https://github.com/co-browser/vibe/compare/v0.1.4...v0.1.5
[v0.1.4]: https://github.com/co-browser/vibe/compare/v0.1.3...v0.1.4
[v0.1.3]: https://github.com/co-browser/vibe/compare/v0.1.2...v0.1.3
[v0.1.2]: https://github.com/co-browser/vibe/compare/v0.1.1...v0.1.2
[v0.1.1]: https://github.com/co-browser/vibe/compare/v0.1.0...v0.1.1
[v0.1.0]: https://github.com/co-browser/vibe/compare/v0.0.0...v0.1.0
