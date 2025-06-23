import { useState } from "react";
import { usePrivy, useLogout } from "@privy-io/react-auth";
import "./UserProfile.css";

export function UserProfile() {
  const { user, authenticated } = usePrivy();
  const { logout } = useLogout();
  const [showDropdown, setShowDropdown] = useState(false);

  if (!authenticated || !user) {
    return null;
  }

  // Get user display information
  const getDisplayName = () => {
    if (user.email?.address) {
      return user.email.address;
    }
    if (user.google?.email) {
      return user.google.email;
    }
    if (user.discord?.username) {
      return user.discord.username;
    }
    if (user.github?.username) {
      return user.github.username;
    }
    if (user.wallet?.address) {
      return `${user.wallet.address.slice(0, 6)}...${user.wallet.address.slice(-4)}`;
    }
    return "User";
  };

  const getDisplayAvatar = () => {
    // Note: Actual profile picture properties may vary based on Privy API
    // These would need to be updated based on the actual Privy user object structure
    return null; // Simplified for now - can be enhanced when actual API structure is known
  };

  const getAuthMethod = () => {
    if (user.email) return "Email";
    if (user.google) return "Google";
    if (user.discord) return "Discord";
    if (user.github) return "GitHub";
    if (user.wallet) return "Wallet";
    return "Unknown";
  };

  const displayName = getDisplayName();
  const avatarUrl = getDisplayAvatar();
  const authMethod = getAuthMethod();

  return (
    <div className="user-profile">
      <div
        className="user-profile-trigger"
        onClick={() => setShowDropdown(!showDropdown)}
      >
        <div className="user-avatar">
          {avatarUrl ? (
            <img src={avatarUrl} alt="User avatar" />
          ) : (
            <div className="avatar-placeholder">
              {displayName.charAt(0).toUpperCase()}
            </div>
          )}
        </div>
        <div className="user-info">
          <div className="user-name">{displayName}</div>
          <div className="user-auth-method">{authMethod}</div>
        </div>
        <div className="dropdown-arrow">{showDropdown ? "▲" : "▼"}</div>
      </div>

      {showDropdown && (
        <div className="user-dropdown">
          <div className="dropdown-header">
            <div className="user-details">
              <div className="user-id">ID: {user.id.slice(0, 8)}...</div>
              <div className="auth-status">✅ Authenticated</div>
            </div>
          </div>

          <div className="dropdown-divider"></div>

          <button
            className="logout-button"
            onClick={() => {
              logout();
              setShowDropdown(false);
            }}
          >
            <span className="logout-icon">🚪</span>
            Sign Out
          </button>
        </div>
      )}
    </div>
  );
}
