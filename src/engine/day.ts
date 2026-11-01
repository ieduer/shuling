/** 日界線：兩岸都是 UTC+8，每日試煉的 seed、今日已戰、連日出陣都用北京／臺北日期，與 Worker 的 day_key 同一條線。 */
const TZ_OFFSET_MS = 8 * 3600 * 1000;

export function beijingDayKey(d: Date = new Date()): string {
  return new Date(d.getTime() + TZ_OFFSET_MS).toISOString().slice(0, 10);
}
