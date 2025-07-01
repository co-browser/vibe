import React from "react";

export const useAutoScroll = (dependencies: any[]) => {
  const messagesEndRef = React.useRef<HTMLDivElement>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const container = containerRef.current?.parentElement;
    if (!container || !messagesEndRef.current) return;

    // Check if user is near the bottom (within 100px)
    const isNearBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight <
      100;

    // Only auto-scroll if user is already near the bottom
    if (isNearBottom) {
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      }, 100);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, dependencies);

  return { messagesEndRef, containerRef };
};
