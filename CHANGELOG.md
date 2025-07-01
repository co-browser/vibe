
<a name="v0.1.2"></a>
## [v0.1.2] - 2025-06-28
### Chore
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

[v0.1.2]: https://github.com/co-browser/vibe/compare/v0.1.1...v0.1.2
[v0.1.1]: https://github.com/co-browser/vibe/compare/v0.1.0...v0.1.1
[v0.1.0]: https://github.com/co-browser/vibe/compare/v0.0.0...v0.1.0
