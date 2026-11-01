// 每日 seed／日鍵必須是北京日期（UTC+8），不隨瀏覽器時區變動；與 worker/index.ts 的 dayKeyOf 同公式。
import { test } from "node:test";
import assert from "node:assert/strict";
import { beijingDayKey } from "../src/engine/day.ts";

test("UTC 2026-10-27T22:35Z（洛杉磯仍是 27 日）在北京已是 28 日", () => {
  assert.equal(beijingDayKey(new Date("2026-10-27T22:35:00Z")), "2026-10-28");
});
test("UTC 2026-10-28T15:59Z 仍是北京 28 日，16:00Z 起是 29 日", () => {
  assert.equal(beijingDayKey(new Date("2026-10-28T15:59:59Z")), "2026-10-28");
  assert.equal(beijingDayKey(new Date("2026-10-28T16:00:00Z")), "2026-10-29");
});
test("格式為 YYYY-MM-DD", () => {
  assert.match(beijingDayKey(), /^\d{4}-\d{2}-\d{2}$/);
});
