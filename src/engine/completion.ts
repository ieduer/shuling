/** 題海（2026-10-31）：文曲之後的路——把題庫裡每一道題都答對一次。
 * 以本機存檔的逐題紀錄（q[id].ok ≥ 1）計，跨裝置由雲端存檔取大合併帶著走；純函數，不碰題庫模組。 */
export interface Completion {
  done: number;
  total: number;
  left: number;
  /** 0..1 */
  ratio: number;
}

export function completionOf(q: Record<string, { ok: number } | undefined>, ids: Iterable<string>): Completion {
  let done = 0;
  let total = 0;
  for (const id of ids) {
    total++;
    const s = q[id];
    if (s && s.ok >= 1) done++;
  }
  return { done, total, left: Math.max(0, total - done), ratio: total ? done / total : 0 };
}
