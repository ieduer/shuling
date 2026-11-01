/** 多字詞的字形字級：一字最大，字愈多愈小，永遠單行置中（修 2026-10-28 三字詞在書靈球內換行溢出）。 */
export function glyphPx(w: string, base: number): number {
  const n = Array.from(w).length;
  if (n <= 1) return base;
  if (n === 2) return Math.round(base * 0.6);
  if (n === 3) return Math.round(base * 0.44);
  if (n === 4) return Math.round(base * 0.34);
  // 書靈的人名、書名可長到十幾字（克拉斯諾霍爾卡伊·拉斯洛）：五字起總寬固定在四字詞的寬度（1.36 字級），不出框
  return Math.floor(base * Math.min(0.28, 1.36 / n));
}
