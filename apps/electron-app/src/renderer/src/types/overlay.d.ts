/**
 * Overlay API TypeScript Definitions
 */

export interface OverlayContent {
  html: string;
  css?: string;
  script?: string;
  visible?: boolean;
}

export interface OverlayAPI {
  show: () => Promise<boolean>;
  hide: () => Promise<boolean>;
  render: (content: OverlayContent) => Promise<boolean>;
  clear: () => Promise<boolean>;
  update: (updates: Partial<OverlayContent>) => Promise<boolean>;
  execute: (script: string) => Promise<any>;
}
