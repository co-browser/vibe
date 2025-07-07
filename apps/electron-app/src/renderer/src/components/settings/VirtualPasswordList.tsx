import { memo, useCallback, useMemo } from "react";
import { FixedSizeList as List } from "react-window";
import { Lock, Eye } from "lucide-react";

interface PasswordEntry {
  id: string;
  url: string;
  username: string;
  password: string;
}

interface VirtualPasswordListProps {
  passwords: PasswordEntry[];
  onCopyUsername: (username: string) => void;
  onCopyPassword: (password: string) => void;
  onViewPassword: (password: PasswordEntry) => void;
  height: number;
}

// Memoized password item component
const PasswordItem = memo<{
  index: number;
  style: React.CSSProperties;
  data: {
    passwords: PasswordEntry[];
    onCopyUsername: (username: string) => void;
    onCopyPassword: (password: string) => void;
    onViewPassword: (password: PasswordEntry) => void;
  };
}>(({ index, style, data }) => {
  const password = data.passwords[index];

  const handleCopyUsername = useCallback(() => {
    data.onCopyUsername(password.username);
  }, [data, password.username]);

  const handleCopyPassword = useCallback(() => {
    data.onCopyPassword(password.password);
  }, [data, password.password]);

  const handleViewPassword = useCallback(() => {
    data.onViewPassword(password);
  }, [data, password]);

  return (
    <div style={style}>
      <div className="group flex items-center justify-between p-3 mx-2 bg-gray-50 hover:bg-gray-100 rounded-lg transition-all">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="w-8 h-8 bg-white rounded-md flex items-center justify-center flex-shrink-0 border">
            <Lock className="h-4 w-4 text-gray-500" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-medium text-gray-900 truncate text-sm">
              {password.url}
            </p>
            <p className="text-xs text-gray-500 truncate">
              {password.username}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleCopyUsername}
            className="px-2 py-1 text-xs text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
            style={{
              borderRadius: "4px",
              "-webkit-corner-smoothing": "subpixel",
            }}
            title="Copy username"
          >
            Copy User
          </button>
          <button
            onClick={handleCopyPassword}
            className="px-2 py-1 text-xs text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
            style={{
              borderRadius: "4px",
              "-webkit-corner-smoothing": "subpixel",
            }}
            title="Copy password"
          >
            Copy Pass
          </button>
          <button
            onClick={handleViewPassword}
            className="p-1 text-muted-foreground hover:text-foreground hover:bg-background transition-colors"
            style={{
              borderRadius: "4px",
              "-webkit-corner-smoothing": "subpixel",
            }}
            title="View details"
          >
            <Eye className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
});

PasswordItem.displayName = "PasswordItem";

export const VirtualPasswordList = memo<VirtualPasswordListProps>(
  ({ passwords, onCopyUsername, onCopyPassword, onViewPassword, height }) => {
    // Memoize the item data to prevent unnecessary re-renders
    const itemData = useMemo(
      () => ({
        passwords,
        onCopyUsername,
        onCopyPassword,
        onViewPassword,
      }),
      [passwords, onCopyUsername, onCopyPassword, onViewPassword],
    );

    return (
      <List
        height={height}
        itemCount={passwords.length}
        itemSize={76} // Height of each password item
        width="100%"
        itemData={itemData}
        overscanCount={5} // Render 5 extra items outside viewport for smoother scrolling
      >
        {PasswordItem}
      </List>
    );
  },
);

VirtualPasswordList.displayName = "VirtualPasswordList";
