export const USER_CENTER_ORIGIN = "https://my.bdfz.net";
export const SITE_KEY = "shuling";
/** 2026-11-01 起書靈已在用戶中心登記（SITE_REGISTRY shuling，記錄模式：blocked_missing_adapter，與 fuzi 相同）。
 * 只寫進度快照（PUT /api/progress）；事件與精通紀錄要等可信轉接器另案上線，見 src/lib/sync.ts。 */
export const UC_REGISTERED = true;

const KEY = "wy-player-name";
export const PLAYER_NAME_EVENT = "shuling-player-name-changed";

export interface BdfzUser {
  id?: number;
  slug?: string;
  display_name?: string;
  displayName?: string;
  avatar_url?: string;
  avatarUrl?: string;
}

export interface BdfzSession {
  authenticated: boolean;
  user: BdfzUser | null;
}

export interface SyncProgressPayload {
  siteKey: string;
  itemKey: string;
  itemTitle: string;
  itemGroup: string;
  itemType: string;
  state: string;
  completed?: boolean;
  score?: number;
  progressPercent: number;
  meta: Record<string, unknown>;
}

export interface SyncRecordPayload {
  siteKey: string;
  kind: "event" | "conversation" | "download";
  recordKey: string;
  title: string;
  summary: string;
  itemGroup: string;
  itemType: string;
  payload: Record<string, unknown>;
}

export interface MasteryReportPayload {
  siteKey: string;
  itemKey: string;
  itemTitle: string;
  scorePercent: number;
  isPerfect?: boolean;
  challengeType?: string;
  challengeIdentifier?: string;
}

function identity() {
  return window.BdfzIdentity;
}

async function userCenterApi(path: string, method: string, body?: unknown): Promise<unknown> {
  if (!UC_REGISTERED) return null;
  const headers: HeadersInit = {};
  let payload: BodyInit | undefined;
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }

  const response = await fetch(`${USER_CENTER_ORIGIN}${path}`, {
    method,
    headers,
    body: payload,
    credentials: "include",
    mode: "cors",
  });
  if (!response.ok) {
    throw new Error(`User center ${method} ${path} failed: ${response.status}`);
  }
  return response.headers.get("content-type")?.includes("json") ? response.json() : null;
}

export function loginUrl(returnTo = window.location.href): string {
  return identity()?.buildAuthUrl?.("login", returnTo) ?? `${USER_CENTER_ORIGIN}/?returnTo=${encodeURIComponent(returnTo)}`;
}

export async function waitForIdentity(timeoutMs = 2500): Promise<typeof window.BdfzIdentity | null> {
  const current = identity();
  if (current) return current;

  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    await new Promise((resolve) => window.setTimeout(resolve, 80));
    const next = identity();
    if (next) return next;
  }
  return null;
}

export async function getSession(): Promise<BdfzSession> {
  if (!UC_REGISTERED) return { authenticated: false, user: null };
  const sdk = await waitForIdentity();
  if (sdk?.getSession) {
    const session = await sdk.getSession();
    return {
      authenticated: !!session?.authenticated,
      user: session?.user ?? null,
    };
  }

  try {
    const response = await fetch(`${USER_CENTER_ORIGIN}/api/session`, {
      credentials: "include",
      mode: "cors",
    });
    if (!response.ok) return { authenticated: false, user: null };
    const session = (await response.json()) as BdfzSession;
    return {
      authenticated: !!session?.authenticated,
      user: session?.user ?? null,
    };
  } catch {
    return { authenticated: false, user: null };
  }
}

export async function logout(): Promise<void> {
  if (!UC_REGISTERED) return;
  const sdk = await waitForIdentity(500);
  try {
    if (sdk?.api) {
      await sdk.api("/api/logout", { method: "POST" });
      return;
    }
    await fetch(`${USER_CENTER_ORIGIN}/api/logout`, {
      method: "POST",
      credentials: "include",
      mode: "cors",
    });
  } catch {
    /* logout is best-effort; the next session refresh is authoritative */
  }
}

export async function syncProgress(payload: SyncProgressPayload): Promise<void> {
  if (!UC_REGISTERED) return;
  const sdk = await waitForIdentity(500);
  if (sdk?.syncProgress) {
    await sdk.syncProgress(payload);
    return;
  }
  await userCenterApi("/api/progress", "PUT", payload);
}

export async function recordEvent(payload: SyncRecordPayload): Promise<void> {
  if (!UC_REGISTERED) return;
  const sdk = await waitForIdentity(500);
  if (sdk?.recordEvent) {
    await sdk.recordEvent(payload);
    return;
  }
  await userCenterApi("/api/data-records", "PUT", payload);
}

export async function reportMastery(payload: MasteryReportPayload): Promise<unknown> {
  if (!UC_REGISTERED) return null;
  const sdk = await waitForIdentity(500);
  if (sdk?.api) {
    return sdk.api("/api/mastery/report", { method: "POST", body: payload });
  }
  return userCenterApi("/api/mastery/report", "POST", payload);
}

export function displayName(user: BdfzUser | null | undefined): string {
  if (!user) return "";
  return user.display_name || user.displayName || user.slug || "Seiue";
}

export function avatarUrl(user: BdfzUser | null | undefined): string {
  return user?.avatar_url || user?.avatarUrl || "";
}

export function loadActivePlayerName(): string {
  try {
    return localStorage.getItem(KEY)?.trim() || "學子";
  } catch {
    return "學子";
  }
}

export function setActivePlayerName(name: string): void {
  const value = name.trim().slice(0, 24) || "學子";
  try {
    localStorage.setItem(KEY, value);
  } catch {
    /* ignore */
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(PLAYER_NAME_EVENT, { detail: value }));
  }
}
