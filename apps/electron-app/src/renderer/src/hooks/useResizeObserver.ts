import { useEffect, useRef, useState, useMemo } from "react";
import { debounce } from "../utils/debounce";

export interface ResizeObserverEntry {
  width: number;
  height: number;
  x: number;
  y: number;
}

export interface UseResizeObserverOptions {
  debounceMs?: number;
  disabled?: boolean;
  onResize?: (entry: ResizeObserverEntry) => void;
}

export function useResizeObserver<T extends HTMLElement = HTMLElement>(
  options: UseResizeObserverOptions = {},
) {
  const { debounceMs = 100, disabled = false, onResize } = options;
  const [entry, setEntry] = useState<ResizeObserverEntry | null>(null);
  const elementRef = useRef<T | null>(null);
  const observerRef = useRef<ResizeObserver | null>(null);

  const debouncedCallback = useMemo(
    () =>
      debounce((entry: ResizeObserverEntry) => {
        setEntry(entry);
        onResize?.(entry);
      }, debounceMs),
    [debounceMs, onResize],
  );

  useEffect(() => {
    if (disabled || !elementRef.current) return;

    observerRef.current = new ResizeObserver(entries => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        const { x, y } = entry.target.getBoundingClientRect();
        debouncedCallback({ width, height, x, y });
      }
    });

    observerRef.current.observe(elementRef.current);

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
        observerRef.current = null;
      }
    };
  }, [disabled, debouncedCallback]);

  return { elementRef, entry };
}
