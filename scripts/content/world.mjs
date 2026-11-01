// 萬國星海（P1）：愛琴海、七丘、扶桑的人物與作品，以及思潮館的流派。
// 身份與事實全來自 Wikidata 快照（data/raw/wikidata/world-lit.json，scripts/fetch/world_wikidata.py 產生）；
// 中文名來自 data/curated/world.tsv（大陸通行譯名＋臺灣譯名）。只有兩條以上可答事實的卡才成卡；
// 只有作者一條事實的作品併入作者卡（「下列哪一部是某某的作品」），不另成卡。
import fs from "node:fs";
import path from "node:path";

export const WORLD_BOOKS = { aegean: "愛琴海", rome: "七丘", fusang: "扶桑", schools: "思潮館" };

// Wikidata 體裁標籤 → 題目用名稱（只轉字形，不換用詞）；不在表內的體裁不出題
const GENRE = { 史詩: "史詩", 古希腊悲剧: "古希臘悲劇", 旧喜剧: "舊喜劇", 敘事詩: "敘事詩", 隨筆: "隨筆", 物語: "物語", 和歌: "和歌", 俳句: "俳句", 俳諧: "俳諧", 軍記物語: "軍記物語", 歷史書: "史書", 自傳: "自傳", 傳記: "傳記", 讀本: "讀本", 浮世草子: "浮世草子" };
// 流派：Wikidata 標籤 → 名稱（大陸／臺灣）；同一流派的重複條目併成一個
const MOVEMENT = {
  Q667661: ["現實主義文學"],
  Q55996: ["自然主義文學"],
  Q147516: ["魔幻現實主義", "魔幻寫實主義"],
  Q24205155: ["魔幻現實主義", "魔幻寫實主義"],
  Q39427: ["超現實主義"],
  Q971480: ["現代主義文學"],
  Q164800: ["象徵主義"],
  Q38066: ["存在主義"],
  Q570341: ["新小說"],
  Q48235: ["斯多亞學派", "斯多噶學派"],
};
const zhLabel = (lab = {}) => lab["zh-hant"] || lab["zh-tw"] || lab["zh-hk"] || lab.zh || "";
const yearOf = (t) => (t ? parseInt(t.slice(0, 1) + t.slice(1).split("-")[0], 10) : null);
export const centuryLabel = (y) => (y < 0 ? `公元前${Math.ceil(-y / 100)}世紀` : `${Math.floor((y - 1) / 100) + 1}世紀`);

export function loadWorld(root, problems, nobelCards) {
  const wd = JSON.parse(fs.readFileSync(path.join(root, "data/raw/wikidata/world-lit.json"), "utf8"));
  for (const p of wd.problems) problems.push(`WORLD-WIKIDATA ${p} (row skipped)`);
  const lines = fs.readFileSync(path.join(root, "data/curated/world.tsv"), "utf8").split("\n").filter((l) => l && !l.startsWith("#"));
  const head = lines[0].split("\t");
  const rows = lines.slice(1).map((l) => Object.fromEntries(l.split("\t").map((v, i) => [head[i], v === "-" ? "" : v])));
  const byId = new Map(rows.map((r) => [r.id, r]));
  const ent = (id) => wd.resolved[id];
  const genreOf = (e) => [...new Set((e?.P136 || []).map((q) => GENRE[zhLabel(wd.aux_labels[q])]).filter(Boolean))];
  const SRC = ["wikidata-world", "curated-world"];

  const people = rows.filter((r) => r.kind === "person" && ent(r.id));
  const works = rows.filter((r) => r.kind === "work" && ent(r.id));
  const cards = [];
  const nameOf = (id) => byId.get(id)?.name;

  // 作品：作者（P50 須等於本表作者）、體裁、成書或出版時間
  const folded = new Map();
  for (const r of works) {
    const e = ent(r.id);
    const facts = [];
    if (r.author) {
      const aq = ent(r.author)?.qid;
      if (!aq || !e.P50.includes(aq)) problems.push(`WORLD-AUTHOR-MISMATCH ${r.id} ${r.author}`);
      else facts.push({ p: "work_author", o: nameOf(r.author), src: SRC });
    }
    const g = genreOf(e);
    if (g.length === 1) facts.push({ p: "work_genre", o: g[0], src: SRC });
    const y = yearOf(e.P577[0] || e.P571[0]);
    if (y && y >= 1600 && y <= 2100) facts.push({ p: "work_decade", o: `${Math.floor(y / 10) * 10}年代`, src: SRC });
    else if (y && y < 1600 && !e.P577[0] && e.P571[0]) facts.push({ p: "work_century", o: centuryLabel(y), src: SRC });
    if (facts.length >= 2) {
      cards.push({ id: `ww-${r.id}`, book: r.region, kind: "work", name: r.name, alt: r.name_tw, en: e.labels.en || r.en, qid: e.qid, author: r.author ? nameOf(r.author) : "", prominence: e.sitelinks, facts });
    } else if (r.author) {
      if (!folded.has(r.author)) folded.set(r.author, []);
      folded.get(r.author).push(r);
      problems.push(`WORLD-WORK-FOLDED ${r.id} (only ${facts.map((f) => f.p).join(",") || "no"} fact; kept as a fact on ${r.author})`);
    } else problems.push(`WORLD-WORK-DROPPED ${r.id} (anonymous, ${facts.length} fact)`);
  }

  // 人物：代表作（含併入的作品）、出生世紀、單一體裁
  for (const r of people) {
    const e = ent(r.id);
    const facts = [];
    for (const w of works.filter((w) => w.author === r.id && ent(w.id)?.P50.includes(e.qid))) facts.push({ p: "author_work", o: w.name, alt: w.name_tw, src: SRC });
    const y = yearOf(e.P569[0]);
    if (y && r.id !== "homer") facts.push({ p: "birth_century", o: centuryLabel(y), src: SRC }); // 荷馬生年是傳說，不出題
    const g = genreOf(e);
    if (g.length === 1) facts.push({ p: "author_genre", o: g[0], src: SRC });
    if (facts.length < 2) {
      problems.push(`WORLD-PERSON-DROPPED ${r.id} (${facts.length} fact)`);
      continue;
    }
    cards.push({ id: `wp-${r.id}`, book: r.region, kind: "person", name: r.name, alt: r.name_tw, en: e.labels.en || r.en, qid: e.qid, prominence: e.sitelinks, facts });
  }

  // 思潮館：Wikidata P135 歸入同一流派的作家至少兩位才成卡
  const members = new Map();
  const addMember = (mq, name) => {
    const m = MOVEMENT[mq];
    if (!m) return;
    if (!members.has(m[0])) members.set(m[0], { names: m, people: new Set() });
    members.get(m[0]).people.add(name);
  };
  for (const c of nobelCards) for (const mq of wd.laureate_movements[c.qid] || []) addMember(mq, c.name);
  for (const r of people) for (const mq of ent(r.id).P135) addMember(mq, r.name);
  // 干擾項必須「不可能屬於」該流派：近代流派只從 1700 年前出生的古典作家取，古代學派只從諾貝爾得主取。
  // （Wikidata 沒標記不等於不屬於，蕭伯納沒被標為現實主義不代表他不是。）
  const born = new Map(people.map((r) => [r.name, yearOf(ent(r.id).P569[0])]));
  const classical = people.filter((r) => (born.get(r.name) ?? 9999) < 1700).map((r) => r.name);
  for (const [name, m] of members) {
    if (m.people.size < 2) continue;
    const modern = [...m.people].some((p) => !born.has(p) || (born.get(p) ?? 0) >= 1700);
    const facts = [...m.people].map((p) => ({ p: "movement_member", o: p, src: ["wikidata-world", "wikidata"] }));
    cards.push({ id: `ws-${name}`, book: "schools", kind: "term", name, alt: m.names[1] || "", prominence: m.people.size * 20, facts, memberSet: m.people, distractorPool: modern ? classical : nobelCards.map((c) => c.name) });
  }
  return { cards, allPeople: [...people.map((r) => r.name), ...nobelCards.map((c) => c.name)], centuries: [...new Set(cards.flatMap((c) => c.facts.filter((f) => f.p === "birth_century").map((f) => f.o)))], genres: [...new Set(Object.values(GENRE))] };
}
