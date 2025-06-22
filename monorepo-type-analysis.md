# Monorepo Type Organization Analysis & Recommendations

## Executive Summary

After reviewing your repository against 2025 monorepo best practices, I found several areas where type organization can be improved. The current `@vibe/shared-types` package contains many types that are only used within single packages and should be moved local to those packages.

## Current Issues Found

### 1. Types That Should Be Local (Not Shared)

#### RAG Types (`packages/shared-types/src/rag/`)
- **Problem**: RAG types like `RAGChunk`, `RAGQueryResult`, `RAGIngestionResult` are only used within the `mcp-rag` package
- **Evidence**: No cross-package usage found in grep search results
- **Recommendation**: Move to `packages/mcp-rag/src/types.ts`

#### Gmail Types (`packages/shared-types/src/gmail/`)
- **Problem**: Gmail OAuth types are only used by the electron app's Gmail service
- **Evidence**: Only found usage in `apps/electron-app/src/main/services/gmail-service.ts`
- **Recommendation**: Move to `apps/electron-app/src/types/gmail.ts`

#### Over-specific Content Types
- **Problem**: Some content extraction types in `packages/shared-types/src/content/` may be too specific to tab-extraction-core
- **Recommendation**: Review and move package-specific types to their respective packages

### 2. Types That Are Legitimately Shared ✅

#### Core Communication Types
- `ChatMessage`, `ChatState`, `StreamResponse` - Used across electron app, agent-core, and renderer
- `IAgentProvider`, `AgentConfig`, `AgentStatus` - Used by multiple packages for agent communication
- `ExtractedPage`, `PageContent` - Used by tab-extraction-core and agent-core
- Logger utilities (`createLogger`) - Used extensively across all packages

#### Browser & CDP Types
- `CDPMetadata`, `CDPTarget`, `TabInfo` - Used by electron app and tab-extraction-core
- Layout and IPC types - Used between main and renderer processes

#### MCP Core Types (Partially)
- `MCPServerConfig`, `MCPConnection` - Used by agent-core, mcp-manager-process, and factory
- However, some MCP types may be overly specific

## Recommended Actions

### Phase 1: Move Package-Specific Types

1. **Move RAG types to local package**:
   ```bash
   # Create local types file
   mkdir -p packages/mcp-rag/src/types
   # Move RAG-specific interfaces
   ```

2. **Move Gmail types to electron app**:
   ```bash
   # Create local types file
   mkdir -p apps/electron-app/src/types
   # Move Gmail OAuth interfaces
   ```

3. **Review and move content types**:
   - Analyze which content types are truly shared vs. package-specific
   - Keep only genuinely shared content types in shared-types

### Phase 2: Cleanup Shared Types Package

1. **Update shared-types index.ts**:
   - Remove exports for moved types
   - Add clear documentation about what belongs in shared-types

2. **Add package-level documentation**:
   ```typescript
   /**
    * @vibe/shared-types
    * 
    * ONLY contains types that are:
    * - Used by multiple packages
    * - Part of public APIs between packages
    * - Core communication interfaces
    * 
    * If a type is only used within one package, it should be local to that package.
    */
   ```

### Phase 3: Update Import Statements

Update packages to import from local types instead of shared-types where appropriate.

## Benefits of This Approach

1. **Modularity**: Packages become more self-contained and easier to extract
2. **Reduced Dependencies**: Fewer unnecessary dependencies on shared-types
3. **Clearer Intent**: shared-types becomes focused on true cross-package communication
4. **Better Performance**: Smaller shared-types package, faster builds
5. **Easier Maintenance**: Types are colocated with their usage

## Implementation Priority

### High Priority
- Move RAG types (only used in one package)
- Move Gmail OAuth types (only used in one app)
- Document shared-types purpose clearly

### Medium Priority  
- Review content extraction types for package-specificity
- Audit MCP types for over-sharing
- Update import statements

### Low Priority
- Consider extracting highly-coupled type groups into focused packages
- Establish linting rules to prevent future violations

## Verification

After implementation, verify success by:
1. Ensuring all packages still build successfully
2. Confirming no broken imports
3. Validating that shared-types only exports truly shared types
4. Running integration tests to ensure functionality is preserved

## Following Best Practices

This approach aligns with 2025 monorepo best practices by:
- ✅ Only sharing types that are actually used across packages
- ✅ Keeping package-specific types local
- ✅ Not promoting types "just in case"
- ✅ Clear documentation of shared-types purpose
- ✅ Improved modularity and maintainability