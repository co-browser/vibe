import React from "react";
import { Tooltip } from "antd";

interface TabReferencePillProps {
  alias: string;
  url?: string;
  title?: string;
  favicon?: string;
}

export const TabReferencePill: React.FC<TabReferencePillProps> = ({
  alias,
  url,
  title,
  favicon,
}) => {
  const displayAlias = alias.startsWith("@") ? alias : `@${alias}`;

  const tooltipContent = title || url || displayAlias;

  return (
    <Tooltip title={tooltipContent} placement="top">
      <span className="tab-reference-pill">
        {favicon && (
          <img
            src={favicon}
            alt=""
            className="tab-reference-favicon"
            onError={e => {
              e.currentTarget.style.display = "none";
            }}
          />
        )}
        <span className="tab-reference-text">{displayAlias}</span>
      </span>
    </Tooltip>
  );
};
