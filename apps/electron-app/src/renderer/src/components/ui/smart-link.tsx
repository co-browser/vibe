import React from "react";
import { handleSmartLinkClick } from "../../utils/linkHandler";

interface SmartLinkProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  href?: string;
  children?: React.ReactNode;
}

export const SmartLink: React.FC<SmartLinkProps> = ({
  href,
  children,
  ...props
}): React.JSX.Element => {
  let tabContext: any | null = null;
  try {
    tabContext = null;
  } catch {
    tabContext = null;
  }

  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>): void => {
    e.preventDefault();

    if (!href) return;

    if (tabContext) {
      const { tabDetails, activeKey, handleTabChange, handleTabAdd } =
        tabContext;
      handleSmartLinkClick(href, {
        tabDetails,
        activeKey,
        handleTabChange,
        handleTabAdd,
      });
    } else {
      window.open(href, "_blank");
    }
  };

  return (
    <a
      href={href}
      onClick={handleClick}
      className="message-link"
      title={href}
      {...props}
    >
      {children}
    </a>
  );
};
