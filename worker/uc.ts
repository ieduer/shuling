/** 用戶中心身分（伺服器端）。UC 的工作階段 cookie `bdfz_uc_session` 是 Domain=.bdfz.net，瀏覽器對本站的每個請求都會一併帶上；
 * Worker 只把這一個 cookie 轉給 UC 的 /api/session 核驗（與 sc／lunyu-battle 的學習證據代理同一做法），結果以 cookie 值的 SHA-256 為鍵在記憶體快取十分鐘。
 * cookie 值不落日誌、不入庫、不回傳給任何人。 */
export interface UcUser {
  slug: string;
  name: string;
}
export type UcResult = { kind: "user"; user: UcUser } | { kind: "anonymous" } | { kind: "unavailable" };

const TTL_OK = 10 * 60 * 1000;
const TTL_BAD = 60 * 1000;
const MAX_ENTRIES = 2000;
const SLUG_RE = /^[a-z0-9-]{1,30}$/;
const cache = new Map<string, { exp: number; user: UcUser | null }>();

/** 請求上有沒有 UC 的工作階段 cookie（不核驗）。登入過的裝置登出後這個 cookie 就沒了。 */
export function ucCookie(request: Request): string | null {
  const m = (request.headers.get("cookie") || "").match(/(?:^|;\s*)bdfz_uc_session=([^;\s]+)/);
  return m && m[1].length <= 4096 ? m[1] : null;
}

async function keyOf(value: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function ucIdentity(request: Request, origin: string): Promise<UcResult> {
  const value = ucCookie(request);
  if (!value) return { kind: "anonymous" };
  const key = await keyOf(value);
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && hit.exp > now) return hit.user ? { kind: "user", user: hit.user } : { kind: "anonymous" };
  let res: Response;
  try {
    res = await fetch(origin + "/api/session", { method: "GET", headers: { cookie: "bdfz_uc_session=" + value, accept: "application/json", "user-agent": "shuling/identity (local, unregistered)" }, signal: AbortSignal.timeout(6000) });
  } catch {
    return { kind: "unavailable" };
  }
  if (res.status >= 500) return { kind: "unavailable" };
  let body: { authenticated?: boolean; user?: { slug?: string; displayName?: string; display_name?: string } | null } = {};
  try {
    body = (await res.json()) as typeof body;
  } catch {
    return { kind: "unavailable" };
  }
  const slug = String(body.user?.slug || "").toLowerCase();
  const user = res.ok && body.authenticated === true && SLUG_RE.test(slug) ? { slug, name: String(body.user?.displayName || body.user?.display_name || slug).slice(0, 40) } : null;
  if (cache.size >= MAX_ENTRIES) cache.delete(cache.keys().next().value as string);
  cache.set(key, { exp: now + (user ? TTL_OK : TTL_BAD), user });
  return user ? { kind: "user", user } : { kind: "anonymous" };
}

/** 測試用：清掉身分快取。 */
export function resetUcCache(): void {
  cache.clear();
}
