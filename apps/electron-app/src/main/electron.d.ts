declare global {
  namespace Electron {
    interface App {
      isQuitting: boolean;
    }
  }

  // Privy auth token for MCP connections
  // eslint-disable-next-line no-var
  var privyAuthToken: string | null;
}

export {};
