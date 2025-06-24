import React from "react";
import { TabContextCard } from "./TabContextCard";

interface TabInfo {
  favicon?: string;
  title: string;
  url: string;
  alias: string;
  tabKey?: string;
}

interface TabContextBarProps {
  tabs: TabInfo[];
  isCurrentTabAuto?: boolean;
  onRemoveTab?: (tabKey: string) => void;
  editable?: boolean;
}

export const TabContextBar: React.FC<TabContextBarProps> = ({
  tabs,
  isCurrentTabAuto = false,
  onRemoveTab,
  editable = false,
}) => {
  if (tabs.length === 0) {
    return null;
  }

  return (
    <div className="tab-context-bar-container">
      <div className="tab-context-bar-label">
        {isCurrentTabAuto && tabs.length === 1
          ? "Current tab included"
          : `${tabs.length} tab${tabs.length > 1 ? "s" : ""} included`}
      </div>
      <div className="tab-context-bar">
        {tabs.map((tab, index) => (
          <TabContextCard
            key={tab.tabKey || index}
            favicon={tab.favicon}
            title={tab.title}
            url={tab.url}
            alias={tab.alias}
            onRemove={
              editable && onRemoveTab
                ? () => onRemoveTab(tab.tabKey || "")
                : undefined
            }
            editable={editable}
          />
        ))}
      </div>
    </div>
  );
};
