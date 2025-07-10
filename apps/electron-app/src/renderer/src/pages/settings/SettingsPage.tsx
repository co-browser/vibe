// SettingsPane.tsx
import { useState, useEffect } from "react";
import {
  AppstoreOutlined,
  SettingOutlined,
  UserOutlined,
  BellOutlined,
  SafetyOutlined,
  SyncOutlined,
  ThunderboltOutlined,
  CloudOutlined,
  KeyOutlined,
  DownloadOutlined,
  GlobalOutlined,
  LeftOutlined,
  RightOutlined,
} from "@ant-design/icons";
import type { MenuProps } from "antd";
import {
  Menu,
  Layout,
  Card,
  Switch,
  Select,
  Input,
  Button,
  Typography,
  Space,
  message,
} from "antd";

const { Sider, Content } = Layout;
const { Title, Text } = Typography;
const { Option } = Select;

type MenuItem = Required<MenuProps>["items"][number];

interface LevelKeysProps {
  key?: string;
  children?: LevelKeysProps[];
}

const getLevelKeys = (items1: LevelKeysProps[]) => {
  const key: Record<string, number> = {};
  const func = (items2: LevelKeysProps[], level = 1) => {
    items2.forEach(item => {
      if (item.key) {
        key[item.key] = level;
      }
      if (item.children) {
        func(item.children, level + 1);
      }
    });
  };
  func(items1);
  return key;
};

const items: MenuItem[] = [
  {
    key: "general",
    icon: <SettingOutlined />,
    label: "General",
    children: [
      { key: "startup", label: "Startup Behavior" },
      { key: "search", label: "Default Search Engine" },
      { key: "language", label: "Language" },
      { key: "theme", label: "Theme" },
    ],
  },
  {
    key: "accounts",
    icon: <UserOutlined />,
    label: "Accounts",
    children: [
      { key: "apple", label: "Apple Account" },
      { key: "google", label: "Google Account" },
      { key: "sync", label: "Sync Settings" },
    ],
  },
  {
    key: "api",
    icon: <KeyOutlined />,
    label: "API Keys",
    children: [{ key: "api-keys", label: "Manage API Keys" }],
  },
  {
    key: "performance",
    icon: <ThunderboltOutlined />,
    label: "Performance",
    children: [
      { key: "hardware", label: "Hardware Acceleration" },
      { key: "memory", label: "Memory Management" },
      { key: "cache", label: "Cache Settings" },
    ],
  },
  {
    key: "privacy",
    icon: <SafetyOutlined />,
    label: "Privacy & Security",
    children: [{ key: "adblocking", label: "AdBlocking" }],
  },
  {
    key: "notifications",
    icon: <BellOutlined />,
    label: "Notifications",
    children: [
      { key: "browser", label: "Browser Notifications" },
      { key: "system", label: "System Notifications" },
      { key: "sounds", label: "Notification Sounds" },
      { key: "tray", label: "System Tray" },
    ],
  },
  {
    key: "sync",
    icon: <SyncOutlined />,
    label: "Sync",
    children: [
      { key: "enable", label: "Enable Sync" },
      { key: "frequency", label: "Sync Frequency" },
      { key: "data", label: "Sync Data Types" },
    ],
  },
  {
    key: "extensions",
    icon: <AppstoreOutlined />,
    label: "Extensions",
    children: [
      { key: "installed", label: "Installed Extensions" },
      { key: "permissions", label: "Extension Permissions" },
    ],
  },
  {
    key: "shortcuts",
    icon: <KeyOutlined />,
    label: "Keyboard Shortcuts",
    children: [
      { key: "navigation", label: "Navigation" },
      { key: "tabs", label: "Tab Management" },
      { key: "browser", label: "Browser Actions" },
    ],
  },
  {
    key: "updates",
    icon: <CloudOutlined />,
    label: "Updates",
    children: [
      { key: "auto", label: "Auto Update" },
      { key: "channel", label: "Update Channel" },
      { key: "check", label: "Check for Updates" },
    ],
  },
  {
    key: "storage",
    icon: <DownloadOutlined />,
    label: "Storage",
    children: [
      { key: "cache", label: "Cache Management" },
      { key: "downloads", label: "Download Location" },
      { key: "data", label: "Data Usage" },
    ],
  },
  {
    key: "location",
    icon: <GlobalOutlined />,
    label: "Location",
    children: [
      { key: "access", label: "Location Access" },
      { key: "permissions", label: "Site Permissions" },
    ],
  },
];

const levelKeys = getLevelKeys(items as LevelKeysProps[]);

const renderContent = (
  selectedKey: string,
  apiKeys?: any,
  passwordVisible?: any,
  handleApiKeyChange?: any,
  saveApiKeys?: any,
  setPasswordVisible?: any,
  trayEnabled?: boolean,
  onTrayToggle?: (enabled: boolean) => void,
  passwordPasteHotkey?: string,
  onPasswordPasteHotkeyChange?: (hotkey: string) => void,
) => {
  switch (selectedKey) {
    case "startup":
      return (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            padding: "40px 0",
          }}
        >
          <Card
            title="Startup Behavior"
            style={{ width: "100%", maxWidth: 600, textAlign: "center" }}
          >
            <Space direction="vertical" style={{ width: "100%" }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <Text strong>When Vibe starts:</Text>
                <Select
                  defaultValue="new-tab"
                  style={{ width: 200 }}
                  size="small"
                >
                  <Option value="new-tab">Open new tab</Option>
                  <Option value="restore">Restore previous session</Option>
                  <Option value="specific">Open specific page</Option>
                </Select>
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <Text strong>Homepage:</Text>
                <Input
                  defaultValue="https://www.google.com"
                  style={{ width: 300 }}
                  placeholder="Enter homepage URL"
                  size="small"
                />
              </div>
            </Space>
          </Card>
        </div>
      );

    case "search":
      return (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            padding: "40px 0",
          }}
        >
          <Card
            title="Default Search Engine"
            style={{ width: "100%", maxWidth: 600, textAlign: "center" }}
          >
            <Space direction="vertical" style={{ width: "100%" }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <Text strong>Search Engine:</Text>
                <Select
                  defaultValue="google"
                  style={{ width: 200 }}
                  size="small"
                >
                  <Option value="google">Google</Option>
                  <Option value="perplexity">Perplexity (AI-powered)</Option>
                  <Option value="bing">Bing</Option>
                  <Option value="duckduckgo">DuckDuckGo</Option>
                </Select>
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <Text strong>Custom Search URL:</Text>
                <Input
                  placeholder="https://example.com/search?q={searchTerms}"
                  style={{ width: 300 }}
                  size="small"
                />
              </div>
            </Space>
          </Card>
        </div>
      );

    case "hardware":
      return (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            padding: "40px 0",
          }}
        >
          <Card
            title="Hardware Acceleration"
            style={{ width: "100%", maxWidth: 600, textAlign: "center" }}
          >
            <Space direction="vertical" style={{ width: "100%" }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "16px 0",
                }}
              >
                <div style={{ textAlign: "left" }}>
                  <Text strong>Use GPU acceleration</Text>
                  <br />
                  <Text type="secondary">
                    Use GPU acceleration when available for better performance
                  </Text>
                </div>
                <Switch defaultChecked size="default" />
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "16px 0",
                }}
              >
                <div style={{ textAlign: "left" }}>
                  <Text strong>Hardware video decoding</Text>
                  <br />
                  <Text type="secondary">
                    Use hardware acceleration for video playback
                  </Text>
                </div>
                <Switch defaultChecked size="default" />
              </div>
            </Space>
          </Card>
        </div>
      );

    case "adblocking":
      return (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            padding: "40px 0",
          }}
        >
          <Card style={{ width: "100%", maxWidth: 600, textAlign: "center" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "20px 0",
              }}
            >
              <div style={{ textAlign: "left" }}>
                <Text strong style={{ fontSize: 16 }}>
                  AdBlocking (via Ghostery)
                </Text>
                <br />
                <Text type="secondary">
                  Block ads and trackers to improve browsing speed and privacy
                </Text>
              </div>
              <Switch defaultChecked size="default" />
            </div>
          </Card>
        </div>
      );

    case "browser":
      return (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            padding: "40px 0",
          }}
        >
          <Card
            title="Browser Notifications"
            style={{ width: "100%", maxWidth: 600, textAlign: "center" }}
          >
            <Space direction="vertical" style={{ width: "100%" }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "16px 0",
                }}
              >
                <div style={{ textAlign: "left" }}>
                  <Text strong>Allow notifications from websites</Text>
                  <br />
                  <Text type="secondary">
                    Show notifications from websites you visit
                  </Text>
                </div>
                <Switch size="default" />
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "16px 0",
                }}
              >
                <div style={{ textAlign: "left" }}>
                  <Text strong>System notifications</Text>
                  <br />
                  <Text type="secondary">
                    Show system notifications for browser events
                  </Text>
                </div>
                <Switch defaultChecked size="default" />
              </div>
            </Space>
          </Card>
        </div>
      );

    case "tray":
      return (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            padding: "40px 0",
          }}
        >
          <Card
            title="System Tray"
            style={{ width: "100%", maxWidth: 600, textAlign: "center" }}
          >
            <Space direction="vertical" style={{ width: "100%" }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "16px 0",
                }}
              >
                <div style={{ textAlign: "left" }}>
                  <Text strong>Show system tray icon</Text>
                  <br />
                  <Text type="secondary">
                    Display Vibe icon in the system tray for quick access
                  </Text>
                </div>
                <Switch
                  size="default"
                  checked={trayEnabled}
                  onChange={onTrayToggle}
                />
              </div>
            </Space>
          </Card>
        </div>
      );

    case "enable":
      return (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            padding: "40px 0",
          }}
        >
          <Card
            title="Enable Sync"
            style={{ width: "100%", maxWidth: 600, textAlign: "center" }}
          >
            <Space direction="vertical" style={{ width: "100%" }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "16px 0",
                }}
              >
                <div style={{ textAlign: "left" }}>
                  <Text strong>Sync your data across devices</Text>
                  <br />
                  <Text type="secondary">
                    Keep your bookmarks, history, and settings in sync
                  </Text>
                </div>
                <Switch size="default" />
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "16px 0",
                }}
              >
                <Text strong>Sync Frequency:</Text>
                <Select
                  defaultValue="15min"
                  style={{ width: 200 }}
                  size="small"
                >
                  <Option value="15min">Every 15 minutes</Option>
                  <Option value="1hour">Every hour</Option>
                  <Option value="6hours">Every 6 hours</Option>
                  <Option value="daily">Daily</Option>
                </Select>
              </div>
            </Space>
          </Card>
        </div>
      );

    case "navigation":
      return (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            padding: "40px 0",
          }}
        >
          <Card
            title="Navigation Shortcuts"
            style={{ width: "100%", maxWidth: 600, textAlign: "center" }}
          >
            <Space direction="vertical" style={{ width: "100%" }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "8px 0",
                }}
              >
                <Text>New Tab</Text>
                <Text code>⌘T</Text>
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "8px 0",
                }}
              >
                <Text>Close Tab</Text>
                <Text code>⌘W</Text>
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "8px 0",
                }}
              >
                <Text>Go Back</Text>
                <Text code>⌘←</Text>
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "8px 0",
                }}
              >
                <Text>Go Forward</Text>
                <Text code>⌘→</Text>
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "8px 0",
                }}
              >
                <Text>Refresh</Text>
                <Text code>⌘R</Text>
              </div>
            </Space>
          </Card>
        </div>
      );

    case "browser-actions":
      return (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            padding: "40px 0",
          }}
        >
          <Card
            title="Browser Actions"
            style={{ width: "100%", maxWidth: 600, textAlign: "center" }}
          >
            <Space direction="vertical" style={{ width: "100%" }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "16px 0",
                }}
              >
                <div style={{ textAlign: "left" }}>
                  <Text strong>Paste Password</Text>
                  <br />
                  <Text type="secondary">
                    Paste the most recent password for the current website
                  </Text>
                </div>
                <Input
                  value={passwordPasteHotkey || "⌘⇧P"}
                  onChange={e => onPasswordPasteHotkeyChange?.(e.target.value)}
                  style={{ width: 120, textAlign: "center" }}
                  placeholder="⌘⇧P"
                />
              </div>
            </Space>
          </Card>
        </div>
      );

    case "auto":
      return (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            padding: "40px 0",
          }}
        >
          <Card
            title="Auto Update"
            style={{ width: "100%", maxWidth: 600, textAlign: "center" }}
          >
            <Space direction="vertical" style={{ width: "100%" }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "16px 0",
                }}
              >
                <div style={{ textAlign: "left" }}>
                  <Text strong>Automatically download and install updates</Text>
                  <br />
                  <Text type="secondary">
                    Keep Vibe up to date with the latest features and security
                    patches
                  </Text>
                </div>
                <Switch defaultChecked size="default" />
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "16px 0",
                }}
              >
                <Text strong>Update Channel:</Text>
                <Select
                  defaultValue="stable"
                  style={{ width: 200 }}
                  size="small"
                >
                  <Option value="stable">Stable</Option>
                  <Option value="beta">Beta</Option>
                  <Option value="nightly">Nightly</Option>
                </Select>
              </div>
              <div style={{ padding: "16px 0" }}>
                <Button
                  size="small"
                  style={{
                    backgroundColor: "#007aff",
                    borderColor: "#007aff",
                    color: "#ffffff",
                    fontSize: "13px",
                    fontWeight: 500,
                    borderRadius: "6px",
                    height: "28px",
                    padding: "0 16px",
                  }}
                >
                  Check for Updates
                </Button>
              </div>
            </Space>
          </Card>
        </div>
      );

    case "cache":
      return (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            padding: "40px 0",
          }}
        >
          <Card
            title="Cache Management"
            style={{ width: "100%", maxWidth: 600, textAlign: "center" }}
          >
            <Space direction="vertical" style={{ width: "100%" }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "16px 0",
                }}
              >
                <div style={{ textAlign: "left" }}>
                  <Text strong>Current cache size: 45.2 MB</Text>
                  <br />
                  <Text type="secondary">
                    Temporary files stored to improve browsing speed
                  </Text>
                </div>
                <Button
                  size="small"
                  style={{
                    backgroundColor: "#f2f2f7",
                    borderColor: "#c7c7cc",
                    color: "#1d1d1f",
                    fontSize: "13px",
                    fontWeight: 500,
                    borderRadius: "6px",
                    height: "28px",
                    padding: "0 16px",
                  }}
                >
                  Clear Cache
                </Button>
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "16px 0",
                }}
              >
                <div style={{ textAlign: "left" }}>
                  <Text strong>Download folder</Text>
                  <br />
                  <Text type="secondary">~/Downloads</Text>
                </div>
                <Button
                  size="small"
                  style={{
                    backgroundColor: "#f2f2f7",
                    borderColor: "#c7c7cc",
                    color: "#1d1d1f",
                    fontSize: "13px",
                    fontWeight: 500,
                    borderRadius: "6px",
                    height: "28px",
                    padding: "0 16px",
                  }}
                >
                  Change Location
                </Button>
              </div>
            </Space>
          </Card>
        </div>
      );

    case "access":
      return (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            padding: "40px 0",
          }}
        >
          <Card
            title="Location Access"
            style={{ width: "100%", maxWidth: 600, textAlign: "center" }}
          >
            <Space direction="vertical" style={{ width: "100%" }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "16px 0",
                }}
              >
                <Text strong>Location Access:</Text>
                <Select defaultValue="ask" style={{ width: 200 }} size="small">
                  <Option value="ask">Ask before accessing</Option>
                  <Option value="allow">Allow</Option>
                  <Option value="block">Block</Option>
                </Select>
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "16px 0",
                }}
              >
                <div style={{ textAlign: "left" }}>
                  <Text strong>Remember location permissions</Text>
                  <br />
                  <Text type="secondary">
                    Remember your choice for each website
                  </Text>
                </div>
                <Switch defaultChecked size="default" />
              </div>
            </Space>
          </Card>
        </div>
      );

    case "api-keys":
      return (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            padding: "40px 0",
          }}
        >
          <Card
            title="API Keys"
            style={{ width: "100%", maxWidth: 600, textAlign: "center" }}
          >
            <Space direction="vertical" style={{ width: "100%" }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "16px 0",
                }}
              >
                <div style={{ textAlign: "left" }}>
                  <Text strong>OpenAI API Key</Text>
                  <br />
                  <Text type="secondary">Used for AI-powered features</Text>
                </div>
                <Input.Password
                  placeholder="sk-..."
                  style={{ width: 300 }}
                  size="small"
                  value={apiKeys?.openai || ""}
                  onChange={e => handleApiKeyChange?.("openai", e.target.value)}
                  onBlur={() => saveApiKeys?.()}
                  visibilityToggle={{
                    visible: passwordVisible?.openai || false,
                    onVisibleChange: visible =>
                      setPasswordVisible?.({
                        ...passwordVisible,
                        openai: visible,
                      }),
                  }}
                />
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "16px 0",
                }}
              >
                <div style={{ textAlign: "left" }}>
                  <Text strong>TurboPuffer API Key</Text>
                  <br />
                  <Text type="secondary">
                    Used for vector search and embeddings
                  </Text>
                </div>
                <Input.Password
                  placeholder="Enter API key"
                  style={{ width: 300 }}
                  size="small"
                  value={apiKeys?.turbopuffer || ""}
                  onChange={e =>
                    handleApiKeyChange?.("turbopuffer", e.target.value)
                  }
                  onBlur={() => saveApiKeys?.()}
                  visibilityToggle={{
                    visible: passwordVisible?.turbopuffer || false,
                    onVisibleChange: visible =>
                      setPasswordVisible?.({
                        ...passwordVisible,
                        turbopuffer: visible,
                      }),
                  }}
                />
              </div>
            </Space>
          </Card>
        </div>
      );

    default:
      return (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            padding: "40px 0",
          }}
        >
          <Card style={{ width: "100%", maxWidth: 600, textAlign: "center" }}>
            <div style={{ padding: "40px 0" }}>
              <SettingOutlined
                style={{ fontSize: 48, color: "#d9d9d9", marginBottom: 16 }}
              />
              <Title level={4}>Select a setting to configure</Title>
              <Text type="secondary">
                Choose an option from the menu to view and modify settings
              </Text>
            </div>
          </Card>
        </div>
      );
  }
};

export function SettingsPane() {
  const [stateOpenKeys, setStateOpenKeys] = useState(["general"]);
  const [selectedKey, setSelectedKey] = useState("adblocking");
  const [apiKeys, setApiKeys] = useState({ openai: "", turbopuffer: "" });
  const [passwordVisible, setPasswordVisible] = useState({
    openai: false,
    turbopuffer: false,
  });
  const [trayEnabled, setTrayEnabled] = useState(true);
  const [passwordPasteHotkey, setPasswordPasteHotkey] = useState("⌘⇧P");

  // Load API keys and tray setting from profile on mount
  useEffect(() => {
    loadApiKeys();
    loadTraySetting();
    loadPasswordPasteHotkey();
  }, []);

  const loadApiKeys = async () => {
    try {
      const [openaiKey, turbopufferKey] = await Promise.all([
        window.apiKeys.get("openai"),
        window.apiKeys.get("turbopuffer"),
      ]);
      setApiKeys({
        openai: openaiKey || "",
        turbopuffer: turbopufferKey || "",
      });
    } catch (error) {
      console.error("Failed to load API keys:", error);
      message.error("Failed to load API keys");
    }
  };

  const loadTraySetting = async () => {
    try {
      const { ipcRenderer } = await import("electron");
      const trayEnabled = await ipcRenderer.invoke(
        "settings:get",
        "tray.enabled",
      );
      setTrayEnabled(trayEnabled ?? true); // Default to true if not set
    } catch (error) {
      console.error("Failed to load tray setting:", error);
      setTrayEnabled(true); // Default to true on error
    }
  };

  const loadPasswordPasteHotkey = async () => {
    try {
      const { ipcRenderer } = await import("electron");
      const result = await ipcRenderer.invoke("hotkeys:get-password-paste");
      if (result.success) {
        setPasswordPasteHotkey(result.hotkey);
      }
    } catch (error) {
      console.error("Failed to load password paste hotkey:", error);
      setPasswordPasteHotkey("⌘⇧P"); // Default hotkey
    }
  };

  const handleApiKeyChange = (key: "openai" | "turbopuffer", value: string) => {
    setApiKeys({ ...apiKeys, [key]: value });
  };

  const saveApiKeys = async () => {
    try {
      const results = await Promise.all([
        apiKeys.openai
          ? window.apiKeys.set("openai", apiKeys.openai)
          : Promise.resolve(true),
        apiKeys.turbopuffer
          ? window.apiKeys.set("turbopuffer", apiKeys.turbopuffer)
          : Promise.resolve(true),
      ]);

      if (results.every(result => result)) {
        message.success("API keys saved successfully");
      } else {
        message.error("Failed to save some API keys");
      }
    } catch (error) {
      console.error("Failed to save API keys:", error);
      message.error("Failed to save API keys");
    }
  };

  const handleTrayToggle = async (enabled: boolean) => {
    try {
      const { ipcRenderer } = await import("electron");
      if (enabled) {
        await ipcRenderer.invoke("tray:create");
      } else {
        await ipcRenderer.invoke("tray:destroy");
      }
      // Save setting
      await ipcRenderer.invoke("settings:set", "tray.enabled", enabled);
      setTrayEnabled(enabled);
      message.success(`System tray ${enabled ? "enabled" : "disabled"}`);
    } catch (error) {
      console.error("Failed to toggle tray:", error);
      message.error("Failed to toggle system tray");
    }
  };

  const handlePasswordPasteHotkeyChange = async (hotkey: string) => {
    try {
      const { ipcRenderer } = await import("electron");
      const result = await ipcRenderer.invoke(
        "hotkeys:set-password-paste",
        hotkey,
      );
      if (result.success) {
        setPasswordPasteHotkey(hotkey);
        message.success("Password paste hotkey updated");
      } else {
        message.error("Failed to update hotkey");
      }
    } catch (error) {
      console.error("Failed to update password paste hotkey:", error);
      message.error("Failed to update hotkey");
    }
  };

  const onOpenChange: MenuProps["onOpenChange"] = openKeys => {
    const currentOpenKey = openKeys.find(
      key => stateOpenKeys.indexOf(key) === -1,
    );

    if (currentOpenKey !== undefined) {
      const repeatIndex = openKeys
        .filter(key => key !== currentOpenKey)
        .findIndex(key => levelKeys[key] === levelKeys[currentOpenKey]);

      setStateOpenKeys(
        openKeys
          .filter((_, index) => index !== repeatIndex)
          .filter(key => levelKeys[key] <= levelKeys[currentOpenKey]),
      );
    } else {
      setStateOpenKeys(openKeys);
    }
  };

  const handleMenuClick: MenuProps["onClick"] = ({ key }) => {
    setSelectedKey(key);
  };

  return (
    <Layout
      style={{
        height: "100vh",
        background: "#fafafa",
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'SF Pro Display', 'Helvetica Neue', sans-serif",
        WebkitFontSmoothing: "antialiased",
        borderRadius: "12px",
        overflow: "hidden",
        border: "1px solid #e5e5e7",
        boxShadow: "0 10px 25px rgba(0, 0, 0, 0.1)",
      }}
    >
      {/* Traffic Lights */}
      <div
        style={{
          position: "absolute",
          top: "13px",
          left: "13px",
          zIndex: 1000,
          display: "flex",
          gap: "8px",
        }}
      >
        <div
          style={{
            width: "12px",
            height: "12px",
            borderRadius: "50%",
            backgroundColor: "#ff5f56",
          }}
        />
        <div
          style={{
            width: "12px",
            height: "12px",
            borderRadius: "50%",
            backgroundColor: "#ffbd2e",
          }}
        />
        <div
          style={{
            width: "12px",
            height: "12px",
            borderRadius: "50%",
            backgroundColor: "#27ca3f",
          }}
        />
      </div>

      <Sider
        width={260}
        style={{
          background: "#f7f7f9",
          borderRight: "1px solid #d1d1d6",
          WebkitFontSmoothing: "antialiased",
          height: "100vh",
        }}
      >
        <Menu
          mode="inline"
          selectedKeys={[selectedKey]}
          openKeys={stateOpenKeys}
          onOpenChange={onOpenChange}
          onClick={handleMenuClick}
          style={{
            background: "#f7f7f9",
            borderRight: "none",
            height: "100vh",
            paddingTop: "60px",
            overflowY: "auto",
            color: "#1d1d1f",
            fontFamily:
              "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'SF Pro Display', 'Helvetica Neue', sans-serif",
            fontSize: "13px",
            fontWeight: 400,
          }}
          items={items}
        />
      </Sider>

      <Layout style={{ background: "#fff" }}>
        {/* Header with navigation and title */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            padding: "16px 24px",
            borderBottom: "1px solid #d1d1d6",
            background: "#fafafa",
            gap: "16px",
            height: "60px",
          }}
        >
          <div
            style={{
              display: "flex",
              gap: "1px",
              borderRadius: "6px",
              overflow: "hidden",
              border: "1px solid #c7c7cc",
            }}
          >
            <Button
              size="small"
              icon={<LeftOutlined />}
              style={{
                backgroundColor: "#ffffff",
                border: "none",
                color: "#007aff",
                width: "32px",
                height: "24px",
                borderRadius: "0",
                fontSize: "11px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            />
            <Button
              size="small"
              icon={<RightOutlined />}
              style={{
                backgroundColor: "#ffffff",
                border: "none",
                borderLeft: "1px solid #c7c7cc",
                color: "#007aff",
                width: "32px",
                height: "24px",
                borderRadius: "0",
                fontSize: "11px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            />
          </div>
          <Title
            level={3}
            style={{
              margin: 0,
              color: "#1d1d1f",
              fontFamily:
                "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Helvetica Neue', sans-serif",
              fontWeight: 600,
              fontSize: "20px",
              letterSpacing: "-0.01em",
            }}
          >
            Settings
          </Title>
        </div>

        <Content
          style={{
            padding: "32px",
            background: "#ffffff",
            overflowY: "auto",
            WebkitFontSmoothing: "antialiased",
            fontFamily:
              "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'SF Pro Display', 'Helvetica Neue', sans-serif",
          }}
        >
          <div style={{ maxWidth: 800, margin: "0 auto" }}>
            {renderContent(
              selectedKey,
              apiKeys,
              passwordVisible,
              handleApiKeyChange,
              saveApiKeys,
              setPasswordVisible,
              trayEnabled,
              handleTrayToggle,
              passwordPasteHotkey,
              handlePasswordPasteHotkeyChange,
            )}
          </div>
        </Content>
      </Layout>
    </Layout>
  );
}
