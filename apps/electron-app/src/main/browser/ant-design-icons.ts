/**
 * Ant Design Icons SVG Extractor
 * Provides SVG content from Ant Design icons as HTML strings
 */

// SVG definitions extracted from @ant-design/icons-svg
const iconSvgs = {
  KeyOutlined: `<svg viewBox="64 64 896 896" focusable="false" width="1em" height="1em" fill="currentColor" style="vertical-align: -0.125em;">
    <path d="M608 112c-167.9 0-304 136.1-304 304 0 70.3 23.9 135 63.9 186.5l-41.1 41.1-62.3-62.3a8.15 8.15 0 00-11.4 0l-39.8 39.8a8.15 8.15 0 000 11.4l62.3 62.3-44.9 44.9-62.3-62.3a8.15 8.15 0 00-11.4 0l-39.8 39.8a8.15 8.15 0 000 11.4l62.3 62.3-65.3 65.3a8.03 8.03 0 000 11.3l42.3 42.3c3.1 3.1 8.2 3.1 11.3 0l253.6-253.6A304.06 304.06 0 00608 720c167.9 0 304-136.1 304-304S775.9 112 608 112zm161.2 465.2C726.2 620.3 668.9 644 608 644c-60.9 0-118.2-23.7-161.2-66.8-43.1-43-66.8-100.3-66.8-161.2 0-60.9 23.7-118.2 66.8-161.2 43-43.1 100.3-66.8 161.2-66.8 60.9 0 118.2 23.7 161.2 66.8 43.1 43 66.8 100.3 66.8 161.2 0 60.9-23.7 118.2-66.8 161.2z"></path>
  </svg>`,

  LockOutlined: `<svg viewBox="64 64 896 896" focusable="false" width="1em" height="1em" fill="currentColor" style="vertical-align: -0.125em;">
    <path d="M832 464h-68V240c0-70.7-57.3-128-128-128H388c-70.7 0-128 57.3-128 128v224h-68c-17.7 0-32 14.3-32 32v384c0 17.7 14.3 32 32 32h640c17.7 0 32-14.3 32-32V496c0-17.7-14.3-32-32-32zM540 701v53c0 22.1-17.9 40-40 40s-40-17.9-40-40v-53c-12.3-9.8-20-25.7-20-43 0-28.5 23.5-52 52-52s52 23.5 52 52c0 17.3-7.7 33.2-20 43zm-152-257V240c0-22.1 17.9-40 40-40h248c22.1 0 40 17.9 40 40v204H388z"></path>
  </svg>`,

  RobotOutlined: `<svg viewBox="64 64 896 896" focusable="false" width="1em" height="1em" fill="currentColor" style="vertical-align: -0.125em;">
    <path d="M300 328a60 60 0 10120 0 60 60 0 10-120 0zM852 64H172c-17.7 0-32 14.3-32 32v660c0 17.7 14.3 32 32 32h680c17.7 0 32-14.3 32-32V96c0-17.7-14.3-32-32-32zM300 488c0 4.4 3.6 8 8 8h56c4.4 0 8-3.6 8-8v-56c0-4.4-3.6-8-8-8h-56c-4.4 0-8 3.6-8 8v56zm152 0c0 4.4 3.6 8 8 8h56c4.4 0 8-3.6 8-8v-56c0-4.4-3.6-8-8-8h-56c-4.4 0-8 3.6-8 8v56zm152 0c0 4.4 3.6 8 8 8h56c4.4 0 8-3.6 8-8v-56c0-4.4-3.6-8-8-8h-56c-4.4 0-8 3.6-8 8v56zm-152 120c0 4.4 3.6 8 8 8h56c4.4 0 8-3.6 8-8v-56c0-4.4-3.6-8-8-8h-56c-4.4 0-8 3.6-8 8v56zm152 0c0 4.4 3.6 8 8 8h56c4.4 0 8-3.6 8-8v-56c0-4.4-3.6-8-8-8h-56c-4.4 0-8 3.6-8 8v56z"></path>
  </svg>`,

  ShoppingCartOutlined: `<svg viewBox="64 64 896 896" focusable="false" width="1em" height="1em" fill="currentColor" style="vertical-align: -0.125em;">
    <path d="M832 312H696v-16c0-101.6-82.4-184-184-184s-184 82.4-184 184v16H192c-17.7 0-32 14.3-32 32v536c0 17.7 14.3 32 32 32h640c17.7 0 32-14.3 32-32V344c0-17.7-14.3-32-32-32zM512 184c66.3 0 120 53.7 120 120v16H392v-16c0-66.3 53.7-120 120-120z"></path>
  </svg>`,

  TrophyOutlined: `<svg viewBox="64 64 896 896" focusable="false" width="1em" height="1em" fill="currentColor" style="vertical-align: -0.125em;">
    <path d="M868 160h-92v-40c0-4.4-3.6-8-8-8H256c-4.4 0-8 3.6-8 8v40h-92c-4.4 0-8 3.6-8 8v148c0 119.1 96.9 216 216 216s216-96.9 216-216V168c0-4.4-3.6-8-8-8zM512 512c-88.2 0-160-71.8-160-160V200h320v152c0 88.2-71.8 160-160 160z"></path>
  </svg>`,
};

/**
 * Get SVG content for an Ant Design icon
 * @param iconName - Name of the icon (e.g., 'KeyOutlined', 'LockOutlined')
 * @returns SVG HTML string or empty string if not found
 */
export function getAntDesignIcon(iconName: string): string {
  return iconSvgs[iconName as keyof typeof iconSvgs] || "";
}

/**
 * Get all available icon names
 * @returns Array of available icon names
 */
export function getAvailableIcons(): string[] {
  return Object.keys(iconSvgs);
}
