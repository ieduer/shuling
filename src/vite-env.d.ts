/// <reference types="vite/client" />

interface Window {
  __BDFZ_WIDGET_CONFIG__?: {
    position?: "left" | "right";
    insetBottom?: number;
    insetSide?: number;
    mobileInsetBottom?: number;
    mobileInsetSide?: number;
  };
  BdfzIdentity?: {
    __version?: string;
    api?: (path: string, options?: { method?: string; headers?: HeadersInit; body?: unknown }) => Promise<unknown>;
    getSession?: () => Promise<{
      authenticated?: boolean;
      user?: {
        id?: number;
        slug?: string;
        display_name?: string;
        displayName?: string;
        avatar_url?: string;
        avatarUrl?: string;
      } | null;
    }>;
    syncProgress?: (record: unknown) => Promise<unknown>;
    recordEvent?: (record: unknown) => Promise<unknown>;
    buildAuthUrl?: (mode?: string, returnTo?: string) => string;
    ensureWidget?: (options?: { siteKey?: string; position?: "left" | "right" }) => unknown;
  };
}
