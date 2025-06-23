import { PrivyProvider } from "@privy-io/react-auth";
import { ReactNode } from "react";

interface PrivyAuthProviderProps {
  children: ReactNode;
}

export function PrivyAuthProvider({ children }: PrivyAuthProviderProps) {
  const appId = import.meta.env.VITE_PRIVY_APP_ID;

  // For development, allow bypassing Privy if no real app ID is provided
  if (!appId || appId === "your-privy-app-id-here") {
    console.warn(
      "No Privy App ID configured, running in development mode without authentication",
    );
    return <div style={{ height: "100vh", width: "100vw" }}>{children}</div>;
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
          showWalletLoginFirst: false,
          walletChainType: "ethereum-only",
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
        supportedChains: [
          {
            id: 1, // Ethereum mainnet
            name: "Ethereum",
            network: "ethereum",
            nativeCurrency: {
              name: "Ether",
              symbol: "ETH",
              decimals: 18,
            },
            rpcUrls: {
              default: {
                http: ["https://eth.llamarpc.com"],
              },
              public: {
                http: ["https://eth.llamarpc.com"],
              },
            },
            blockExplorers: {
              default: {
                name: "Etherscan",
                url: "https://etherscan.io",
              },
            },
          },
        ],

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
