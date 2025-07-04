// SettingsPane.tsx
import { useState } from "react";
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
    children: [
      { key: "tracking", label: "Tracking Protection" },
      { key: "cookies", label: "Cookie Settings" },
      { key: "permissions", label: "Site Permissions" },
    ],
  },
  {
    key: "notifications",
    icon: <BellOutlined />,
    label: "Notifications",
    children: [
      { key: "browser", label: "Browser Notifications" },
      { key: "system", label: "System Notifications" },
      { key: "sounds", label: "Notification Sounds" },
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

const renderContent = (selectedKey: string) => {
  switch (selectedKey) {
    case "startup":
      return (
        <Card title="Startup Behavior" style={{ marginBottom: 16 }}>
          <Space direction="vertical" style={{ width: "100%" }}>
            <div>
              <Text strong>When Vibe starts:</Text>
              <Select
                defaultValue="new-tab"
                style={{ width: 200, marginLeft: 16 }}
              >
                <Option value="new-tab">Open new tab</Option>
                <Option value="restore">Restore previous session</Option>
                <Option value="specific">Open specific page</Option>
              </Select>
            </div>
            <div>
              <Text strong>Homepage:</Text>
              <Input
                defaultValue="https://www.google.com"
                style={{ width: 300, marginLeft: 16 }}
                placeholder="Enter homepage URL"
              />
            </div>
          </Space>
        </Card>
      );

    case "search":
      return (
        <Card title="Default Search Engine" style={{ marginBottom: 16 }}>
          <Space direction="vertical" style={{ width: "100%" }}>
            <div>
              <Text strong>Search Engine:</Text>
              <Select
                defaultValue="perplexity"
                style={{ width: 200, marginLeft: 16 }}
              >
                <Option value="perplexity">Perplexity (AI-powered)</Option>
                <Option value="google">Google</Option>
                <Option value="bing">Bing</Option>
                <Option value="duckduckgo">DuckDuckGo</Option>
              </Select>
            </div>
            <div>
              <Text strong>Custom Search URL:</Text>
              <Input
                placeholder="https://example.com/search?q={searchTerms}"
                style={{ width: 400, marginLeft: 16 }}
              />
            </div>
          </Space>
        </Card>
      );

    case "hardware":
      return (
        <Card title="Hardware Acceleration" style={{ marginBottom: 16 }}>
          <Space direction="vertical" style={{ width: "100%" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div>
                <Text strong>Use GPU acceleration</Text>
                <br />
                <Text type="secondary">
                  Use GPU acceleration when available for better performance
                </Text>
              </div>
              <Switch defaultChecked />
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div>
                <Text strong>Hardware video decoding</Text>
                <br />
                <Text type="secondary">
                  Use hardware acceleration for video playback
                </Text>
              </div>
              <Switch defaultChecked />
            </div>
          </Space>
        </Card>
      );

    case "tracking":
      return (
        <Card title="Tracking Protection" style={{ marginBottom: 16 }}>
          <Space direction="vertical" style={{ width: "100%" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div>
                <Text strong>Block tracking scripts</Text>
                <br />
                <Text type="secondary">
                  Block scripts that track your browsing activity
                </Text>
              </div>
              <Switch defaultChecked />
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div>
                <Text strong>Block fingerprinting</Text>
                <br />
                <Text type="secondary">
                  Prevent websites from creating unique browser fingerprints
                </Text>
              </div>
              <Switch defaultChecked />
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div>
                <Text strong>Send Do Not Track header</Text>
                <br />
                <Text type="secondary">
                  Tell websites you don't want to be tracked
                </Text>
              </div>
              <Switch defaultChecked />
            </div>
          </Space>
        </Card>
      );

    case "browser":
      return (
        <Card title="Browser Notifications" style={{ marginBottom: 16 }}>
          <Space direction="vertical" style={{ width: "100%" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div>
                <Text strong>Allow notifications from websites</Text>
                <br />
                <Text type="secondary">
                  Show notifications from websites you visit
                </Text>
              </div>
              <Switch />
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div>
                <Text strong>System notifications</Text>
                <br />
                <Text type="secondary">
                  Show system notifications for browser events
                </Text>
              </div>
              <Switch defaultChecked />
            </div>
          </Space>
        </Card>
      );

    case "enable":
      return (
        <Card title="Enable Sync" style={{ marginBottom: 16 }}>
          <Space direction="vertical" style={{ width: "100%" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div>
                <Text strong>Sync your data across devices</Text>
                <br />
                <Text type="secondary">
                  Keep your bookmarks, history, and settings in sync
                </Text>
              </div>
              <Switch />
            </div>
            <div>
              <Text strong>Sync Frequency:</Text>
              <Select
                defaultValue="15min"
                style={{ width: 200, marginLeft: 16 }}
              >
                <Option value="15min">Every 15 minutes</Option>
                <Option value="1hour">Every hour</Option>
                <Option value="6hours">Every 6 hours</Option>
                <Option value="daily">Daily</Option>
              </Select>
            </div>
          </Space>
        </Card>
      );

    case "navigation":
      return (
        <Card title="Navigation Shortcuts" style={{ marginBottom: 16 }}>
          <Space direction="vertical" style={{ width: "100%" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
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
              }}
            >
              <Text>Refresh</Text>
              <Text code>⌘R</Text>
            </div>
          </Space>
        </Card>
      );

    case "auto":
      return (
        <Card title="Auto Update" style={{ marginBottom: 16 }}>
          <Space direction="vertical" style={{ width: "100%" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div>
                <Text strong>Automatically download and install updates</Text>
                <br />
                <Text type="secondary">
                  Keep Vibe up to date with the latest features and security
                  patches
                </Text>
              </div>
              <Switch defaultChecked />
            </div>
            <div>
              <Text strong>Update Channel:</Text>
              <Select
                defaultValue="stable"
                style={{ width: 200, marginLeft: 16 }}
              >
                <Option value="stable">Stable</Option>
                <Option value="beta">Beta</Option>
                <Option value="nightly">Nightly</Option>
              </Select>
            </div>
            <Button type="primary">Check for Updates</Button>
          </Space>
        </Card>
      );

    case "cache":
      return (
        <Card title="Cache Management" style={{ marginBottom: 16 }}>
          <Space direction="vertical" style={{ width: "100%" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div>
                <Text strong>Current cache size: 45.2 MB</Text>
                <br />
                <Text type="secondary">
                  Temporary files stored to improve browsing speed
                </Text>
              </div>
              <Button>Clear Cache</Button>
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div>
                <Text strong>Download folder</Text>
                <br />
                <Text type="secondary">~/Downloads</Text>
              </div>
              <Button>Change Location</Button>
            </div>
          </Space>
        </Card>
      );

    case "access":
      return (
        <Card title="Location Access" style={{ marginBottom: 16 }}>
          <Space direction="vertical" style={{ width: "100%" }}>
            <div>
              <Text strong>Location Access:</Text>
              <Select defaultValue="ask" style={{ width: 200, marginLeft: 16 }}>
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
              }}
            >
              <div>
                <Text strong>Remember location permissions</Text>
                <br />
                <Text type="secondary">
                  Remember your choice for each website
                </Text>
              </div>
              <Switch defaultChecked />
            </div>
          </Space>
        </Card>
      );

    default:
      return (
        <Card>
          <div style={{ textAlign: "center", padding: "40px 0" }}>
            <SettingOutlined
              style={{ fontSize: 48, color: "#d9d9d9", marginBottom: 16 }}
            />
            <Title level={4}>Select a setting to configure</Title>
            <Text type="secondary">
              Choose an option from the menu to view and modify settings
            </Text>
          </div>
        </Card>
      );
  }
};

export function SettingsPane() {
  const [stateOpenKeys, setStateOpenKeys] = useState(["general"]);
  const [selectedKey, setSelectedKey] = useState("startup");

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
    <Layout style={{ height: "100vh", background: "#fff" }}>
      <Sider
        width={280}
        style={{
          background: "#2f3640",
          borderRight: "1px solid #e8e8e8",
        }}
      >
        <div
          style={{ padding: "24px 16px", borderBottom: "1px solid #404040" }}
        >
          <Title level={3} style={{ color: "#fff", margin: 0 }}>
            Settings
          </Title>
        </div>
        <Menu
          mode="inline"
          selectedKeys={[selectedKey]}
          openKeys={stateOpenKeys}
          onOpenChange={onOpenChange}
          onClick={handleMenuClick}
          style={{
            background: "#2f3640",
            borderRight: "none",
            height: "calc(100vh - 80px)",
            overflowY: "auto",
          }}
          items={items}
          theme="dark"
        />
      </Sider>
      <Content
        style={{ padding: "24px", background: "#fff", overflowY: "auto" }}
      >
        <div style={{ maxWidth: 800 }}>{renderContent(selectedKey)}</div>
      </Content>
    </Layout>
  );
}
