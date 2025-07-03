/**
 * Shared utility functions
 */

/**
 * Truncates a URL to a readable length for display
 */
export function truncateUrl(url: string, maxLength: number = 50): string {
  if (url.length <= maxLength) return url;

  try {
    const urlObj = new URL(url);
    const domain = urlObj.hostname;
    const path = urlObj.pathname + urlObj.search;

    if (domain.length + 3 >= maxLength) {
      return domain.substring(0, maxLength - 3) + "...";
    }

    const availableLength = maxLength - domain.length - 3;
    if (path.length <= availableLength) {
      return domain + path;
    }

    return domain + path.substring(0, availableLength) + "...";
  } catch {
    return url.substring(0, maxLength - 3) + "...";
  }
}

/**
 * Debounces a function call
 */
export function debounce<T extends (...args: any[]) => void>(
  func: T,
  wait: number,
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null;
  return (...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

export * from "./path";
