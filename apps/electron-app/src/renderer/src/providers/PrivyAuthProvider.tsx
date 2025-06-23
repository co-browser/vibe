import { PrivyProvider } from "@privy-io/react-auth";
import { ReactNode } from "react";

interface PrivyAuthProviderProps {
  children: ReactNode;
}

export function PrivyAuthProvider({ children }: PrivyAuthProviderProps) {
  const appId = import.meta.env.VITE_PRIVY_APP_ID;

  if (!appId) {
    console.error("VITE_PRIVY_APP_ID environment variable is not set");
    return (
      <div
        style={{
          padding: "20px",
          textAlign: "center",
          color: "red",
          background: "#ffe6e6",
          margin: "20px",
          borderRadius: "8px",
        }}
      >
        <h3>Configuration Error</h3>
        <p>
          Privy App ID is not configured. Please add VITE_PRIVY_APP_ID to your
          environment variables.
        </p>
      </div>
    );
  }

  return (
    <PrivyProvider
      appId={appId}
      config={{
        // UI Configuration
        appearance: {
          theme: "dark", // Match your app's theme
          accentColor: "#6366f1", // Customize to match your brand
          logo: undefined, // Add your logo URL if desired
        },

        // Authentication Methods
        loginMethods: [
          "email",
          "wallet",
          "google",
          "apple",
          "discord",
          "github",
        ],

        // Embedded Wallet Configuration
        embeddedWallets: {
          createOnLogin: "users-without-wallets",
          requireUserPasswordOnCreate: false, // Set to true for extra security
          showWalletUIs: false, // Keep false for agent-focused app
        },

        // Additional Configuration
        defaultChain: undefined, // Add if you need specific chain support
        supportedChains: [], // Add supported chains if needed

        // Security Settings
        mfa: {
          noPromptOnMfaRequired: false,
        },
      }}
    >
      {children}
    </PrivyProvider>
  );
}
