import { ReactNode } from "react";
import { usePrivy, useLogin } from "@privy-io/react-auth";
import "./AuthGuard.css";

interface AuthGuardProps {
  children: ReactNode;
  fallback?: ReactNode;
}

export function AuthGuard({ children, fallback }: AuthGuardProps) {
  const { ready, authenticated } = usePrivy();
  const { login } = useLogin();

  // Show loading state while Privy is initializing
  if (!ready) {
    return (
      <div className="auth-loading">
        <div className="loading-container">
          <div className="loading-spinner animate-spin-custom"></div>
          <p>Initializing authentication...</p>
        </div>
      </div>
    );
  }

  // Show login interface if not authenticated
  if (!authenticated) {
    return fallback || <LoginPrompt onLogin={login} />;
  }

  // User is authenticated, render protected content
  return <>{children}</>;
}

interface LoginPromptProps {
  onLogin: () => void;
}

function LoginPrompt({ onLogin }: LoginPromptProps) {
  const handleLogin = () => {
    console.log("🔐 Login button clicked, triggering Privy authentication...");
    onLogin();
  };

  return (
    <div className="auth-login-prompt chat-panel-auth">
      <div className="login-container">
        <div className="login-header">
          <h2>🤖 Access Required</h2>
          <p>Please sign in to access Vibe's AI agent capabilities</p>
        </div>

        <div className="login-features">
          <div className="feature-item">
            <span className="feature-icon">🚀</span>
            <span>AI-powered browser automation</span>
          </div>
          <div className="feature-item">
            <span className="feature-icon">🔧</span>
            <span>Advanced tool integrations</span>
          </div>
          <div className="feature-item">
            <span className="feature-icon">💬</span>
            <span>Intelligent chat assistance</span>
          </div>
          <div className="feature-item">
            <span className="feature-icon">🔒</span>
            <span>Secure & private interactions</span>
          </div>
        </div>

        <button onClick={handleLogin} className="login-button">
          Sign In to Continue
        </button>

        <div className="login-security-note">
          <p>
            🔐 Your data is encrypted and secure. We support multiple
            authentication methods including email, social login, and crypto
            wallets.
          </p>
        </div>
      </div>
    </div>
  );
}
