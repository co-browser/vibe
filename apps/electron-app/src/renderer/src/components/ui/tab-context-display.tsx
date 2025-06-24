import React from "react";
import { FaviconPill } from "@/components/ui/favicon-pill";
import { TabContextItem } from "@/types/tabContext";

interface TabContextDisplayProps {
  sharedLoadingEntry?: TabContextItem;
  completedTabs: TabContextItem[];
  regularTabs: TabContextItem[];
  hasMoreTabs: boolean;
  moreTabsCount: number;
}

export const TabContextDisplay: React.FC<TabContextDisplayProps> = ({
  sharedLoadingEntry,
  completedTabs,
  regularTabs,
  hasMoreTabs,
  moreTabsCount,
}) => {
  const MAX_VISIBLE_TABS = 5;
  const visibleCompletedTabs = completedTabs.slice(0, MAX_VISIBLE_TABS);
  const remainingSlots = MAX_VISIBLE_TABS - visibleCompletedTabs.length;
  const visibleRegularTabs = regularTabs.slice(0, remainingSlots);
  const hiddenTabsCount =
    completedTabs.length -
    visibleCompletedTabs.length +
    regularTabs.length -
    visibleRegularTabs.length +
    (hasMoreTabs ? moreTabsCount : 0);

  return (
    <div className="favicon-pills">
      {sharedLoadingEntry && (
        <FaviconPill
          key="shared-loading-indicator"
          tooltipTitle={(() => {
            const loadingTabs = (sharedLoadingEntry as any).loadingTabs || [];
            return loadingTabs
              .map((tab: any) => tab.title || "Untitled")
              .join(", ");
          })()}
          style={{ zIndex: 10 }}
        >
          <div
            style={{
              position: "relative",
              width: "24px",
              height: "24px",
            }}
          >
            {((sharedLoadingEntry as any).loadingTabs || []).map(
              (tab: any, idx: number) => (
                <div
                  key={tab.key}
                  style={{
                    position: idx === 0 ? "static" : "absolute",
                    top: idx === 0 ? 0 : `${idx * 2}px`,
                    left: idx === 0 ? 0 : `${idx * 2}px`,
                    zIndex:
                      ((sharedLoadingEntry as any).loadingTabs || []).length -
                      idx,
                    width: "24px",
                    height: "24px",
                  }}
                >
                  {tab.favicon && tab.favicon !== "" ? (
                    <img
                      src={tab.favicon}
                      alt={tab.title || "Tab"}
                      style={{
                        width: "24px",
                        height: "24px",
                        borderRadius: "4px",
                        border: idx > 0 ? "1px solid white" : "none",
                      }}
                      onError={e => {
                        (e.target as HTMLImageElement).style.display = "none";
                        const placeholder = (e.target as HTMLImageElement)
                          .nextElementSibling;
                        if (placeholder) {
                          (placeholder as HTMLElement).style.display = "flex";
                        }
                      }}
                    />
                  ) : (
                    <div
                      className="favicon-pill-placeholder"
                      style={{
                        width: "24px",
                        height: "24px",
                        fontSize: "12px",
                        borderRadius: "4px",
                        border: idx > 0 ? "1px solid white" : "none",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        backgroundColor: "#f0f0f0",
                      }}
                    >
                      {(tab.title || "T").charAt(0).toUpperCase()}
                    </div>
                  )}
                </div>
              ),
            )}
          </div>
        </FaviconPill>
      )}

      {visibleCompletedTabs.map((tab, index) => {
        const statusTitle = (tab as any).isFallback
          ? "Tab processed with warnings"
          : "Tab successfully processed";

        return (
          <FaviconPill
            key={tab.key}
            favicon={tab.favicon}
            title={tab.title}
            tooltipTitle={`${tab.title || "Untitled"} - ${statusTitle}`}
            style={{ zIndex: 5 - index }}
          />
        );
      })}

      {visibleRegularTabs.map((tab, index) => (
        <FaviconPill
          key={tab.key}
          favicon={tab.favicon}
          title={tab.title}
          tooltipTitle={tab.title || "Untitled"}
          style={{ zIndex: 5 - index }}
        />
      ))}

      {hiddenTabsCount > 0 && (
        <FaviconPill tooltipTitle={`${hiddenTabsCount} more tabs`}>
          <div className="favicon-pill favicon-more">+{hiddenTabsCount}</div>
        </FaviconPill>
      )}
    </div>
  );
};
