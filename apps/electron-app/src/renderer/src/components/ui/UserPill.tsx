import { User } from "lucide-react";

interface UserPillProps {
  user?: {
    address?: string;
    email?: string;
    name?: string;
  };
  isAuthenticated: boolean;
  className?: string;
  size?: "sm" | "md" | "lg";
}

/**
 * UserPill component styled to match the settings view
 * Shows user info when authenticated with Privy
 */
export function UserPill({
  user,
  isAuthenticated,
  className = "",
  size = "md",
}: UserPillProps) {
  const sizeClasses = {
    sm: "px-3 py-1.5 text-xs",
    md: "px-4 py-2 text-sm",
    lg: "px-5 py-2.5 text-base",
  };

  const iconSize = {
    sm: "h-3 w-3",
    md: "h-4 w-4",
    lg: "h-5 w-5",
  };

  if (!isAuthenticated || !user) {
    return null;
  }

  const displayName =
    user.name ||
    user.email ||
    user.address?.slice(0, 6) + "..." + user.address?.slice(-4);

  return (
    <div
      className={`inline-flex items-center gap-2 bg-gray-100 text-gray-700 font-medium transition-colors ${sizeClasses[size]} ${className}`}
      style={{
        borderRadius: "6px",
        "-webkit-corner-smoothing": "subpixel",
        border: "1px solid rgba(0, 0, 0, 0.08)",
      }}
    >
      <User className={iconSize[size]} />
      <span>{displayName}</span>
    </div>
  );
}
