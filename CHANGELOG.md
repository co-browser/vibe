
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

[v0.1.1]: https://github.com/co-browser/vibe/compare/v0.1.0...v0.1.1
[v0.1.0]: https://github.com/co-browser/vibe/compare/v0.0.0...v0.1.0
