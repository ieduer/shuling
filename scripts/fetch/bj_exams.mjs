#!/usr/bin/env node
// 真卷殿·北京卷快照：從高考站（gk.bdfz.net）已接受版本讀北京卷語文題面與答案核查表，只取文學類單選題，寫 data/raw/exams/bj-literature.json。
// 用法：node scripts/fetch/bj_exams.mjs [GK_REPO] [COMMIT]（預設 /Users/ylsuen/CF/sites/exam/gaokao、a209908…，即發布登記簿 gk-bdfz-net 的 accepted source）
// 收題規則（每條都必須成立，否則整批失敗、不寫輸出）：
// - 答案核查表狀態 reviewed、kind single_choice、恰有一個正確選項，且在 answer-release-scope 的 activeQuestionIds 內；
// - 核查表的 inputSha256 與現行題面重新計算的雜湊一致（題面、材料、選項順序都綁定）；
// - 題面不得是「教學修訂版」（非原卷文字）；選項必須恰好解析成 A–D 四項（標記接「．」「.」「、」或「。」）；
// - 選項只整理排版：去掉末項後的答題框，名單式選項按欄位以「、」分隔；整理後不得殘留答題框或高考站的核對說明；
// - 延伸閱讀只收原文與辭書條目（CONTENT_REFS），標題不得是核對紀錄；
// - 解析取高考站給學生看的那一份（核查表 currentVersion 指向的模型作答），必須綁定現行題面與完整語境，結論字母等於核查答案；
//   只刪下列 TRIM 逐條審過的高考站處理說明（題面更正、出版鏈、裁定經過），刪過的標「節錄」，其餘一字不改；
// - 範圍：詩詞鑑賞（shici）全部合格題；文學常識與名著只收下列逐題審過的題號。
// 高考站的答案是「學習參考」：依公開解析與雙模型覆核，原考試機構答案出版鏈未證實（核查表 releaseQualification）。快照照錄這個限定。
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";

const ROOT = path.resolve(new URL("../../", import.meta.url).pathname);
const GK = process.argv[2] || "/Users/ylsuen/CF/sites/exam/gaokao";
const COMMIT = process.argv[3] || "a209908baa1e5ec1e3fa31f5c15b6a64ff4f2499";
const WENXUE = ["2007-yuyanjichu:5", "2008-yuyanjichu:5", "2009-yuyanjichu:5", "2010-yuyanjichu:4", "2011-yuyanjichu:4", "2012-yuyanjichu:5"];
const MINGZHU = ["2014-honglou:1"];
const CONTENT_REFS = ["checked_reference", "dictionary", "dictionary_usage", "primary_literary_text", "primary_text", "primary_source", "source_text", "literary_text"];
const MODEL_NAMES = { "gpt-6-astra": "GPT-6 Astra", "claude-opus-5-5": "Claude Opus 5.5" };
// 解析裡的高考站處理說明（逐條審過）：sentence＝刪去以此開頭、到「。」為止的一句；clause＝刪去這段字（換成 to）；paragraph＝刪去以此開頭的一段
const TRIM = {
  "2008-yuyanjichu:5": [{ sentence: "下划线按保存的公开重排页可见范围呈现" }],
  "2009-yuyanjichu:5": [{ clause: "；不把对B的概括擅自改成某位评论家的逐字引文。", to: "。" }],
  "2009-shici:1": [{ paragraph: "本次裁定依据是" }],
  "2014-shici:1": [{ sentence: "注中禁应为消受" }],
  "2025-shici:2": [{ sentence: "题面已由" }],
};
// 畫線標記：高考站題面沒有保留畫線，只在 annotation 的「题面标记说明」逐處寫明畫線範圍（按公開重排頁核對，原卷印刷未驗收）。
// 這裡把畫線處照該說明附在題幹末尾（標明出處），選項與答案不動。每處必須依序出現在說明的引號裡，且出現在題幹對應的第 n 句。
const MARKS = {
  "2008-yuyanjichu:5": ["司马", "陈王", "继东坡，高唱大江东去", "幽愁发愤"],
};
function markNote(id, record, stem) {
  const targets = MARKS[id];
  if (!targets) return { stem, ok: true };
  const ann = String(record.annotation || "");
  const quoted = [...ann.matchAll(/[①②③④]“([^”]+)”/g)].map((m) => m[1]);
  const lines = stem.split("\n").slice(1);
  const ok = quoted.join("|") === targets.join("|") && targets.every((t, i) => lines[i]?.startsWith(String(i + 1)) && lines[i].includes(t));
  return { stem: `${stem}\n（畫線處依次為：${targets.map((t, i) => `${i + 1}「${t}」`).join("　")}。據高考站題面標記說明補注）`, ok };
}
const PROCESS_NOTE = /出版链|认证|null|裁定|题面已|本次裁定|判分|历史作答|原卷|重排|Claude|GPT|暴露|复核|核对|评分|题源/; // 「本次游村」之類的正文不算
function trimReasoning(id, text) {
  let t = text;
  for (const r of TRIM[id] || []) {
    const before = t;
    if (r.clause) t = t.split(r.clause).join(r.to ?? "");
    else if (r.paragraph) t = t.split("\n").filter((p) => !p.startsWith(r.paragraph)).join("\n");
    else t = t.replace(new RegExp(`${r.sentence.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[^。]*。`, "g"), "");
    // 每條規則必須恰好刪去一處
    const hits = r.clause ? before.split(r.clause).length - 1 : r.paragraph ? before.split("\n").filter((p) => p.startsWith(r.paragraph)).length : (before.match(new RegExp(r.sentence.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) || []).length;
    if (hits !== 1) return null;
  }
  return { text: t.trim(), excerpt: t !== text };
}
const sha = (b) => createHash("sha256").update(b).digest("hex");
const show = (f) => execFileSync("git", ["-C", GK, "show", `${COMMIT}:${f}`], { maxBuffer: 256 * 1024 * 1024 });
const raw = { all: show("data/all.json"), authority: show("data/answer-authority.json"), scope: show("data/answer-release-scope.json") };
const all = JSON.parse(raw.all);
const authority = JSON.parse(raw.authority);
const scope = JSON.parse(raw.scope);
const active = new Set(scope.activeQuestionIds);
const records = new Map(all.map((r) => [r.id, r]));
// 與高考站 scripts/lib/answer-authority.mjs 的 questionDigest 同一算法
const digest = (record, question) => sha(JSON.stringify({ recordId: record.id, qIndex: question.qIndex, materials: record.materials, topic: record.topic, question: question.text }));

// 選項排版：去掉原卷末項後的答題框「答：[ ]」（只跟在 D 後面，會把 D 標成特別的一項）；名單式選項（欄位間多個空格，
// 兩字姓名中間補一格對齊，如「李清照       李 白」）照欄位改成「、」分隔，否則「李 白」會被讀成兩個人。字不改。
const ANSWER_BOX = /\s*答\s*[:：]\s*[[［（(【]\s*[\]］）)】]\s*$/u;
function tidy(raw) {
  const t = raw.replace(ANSWER_BOX, "").trim();
  const cols = t.split(/\s{2,}/);
  if (cols.length > 1 && cols.every((c) => /^[\p{Script=Han}·]+(?: [\p{Script=Han}·]+)*$/u.test(c))) return { text: cols.map((c) => c.replace(/ /g, "")).join("、"), cols: cols.length };
  return { text: t.replace(/\s+/g, " "), cols: 1 };
}

function parse(text) {
  // 選項標記：行首或空白後的 A–D 接「．」「.」「、」；四個標記必須依序各出現一次
  const marks = [];
  const re = /(^|\s)([A-D])\s*[．.、。]/g;
  let m;
  while ((m = re.exec(text))) marks.push({ key: m[2], at: m.index + m[1].length, body: re.lastIndex });
  const seq = [];
  for (const k of ["A", "B", "C", "D"]) {
    const hit = marks.find((x) => x.key === k && (!seq.length || x.at > seq[seq.length - 1].at));
    if (!hit) return null;
    seq.push(hit);
  }
  const tidied = seq.map((x, i) => tidy(text.slice(x.body, i < 3 ? seq[i + 1].at : undefined)));
  // 名單式選項四項欄數必須一致，否則寧可失敗
  if (new Set(tidied.map((o) => o.cols)).size !== 1) return null;
  const options = seq.map((x, i) => ({ key: x.key, text: tidied[i].text }));
  if (options.some((o) => !o.text)) return null;
  const stem = text
    .slice(0, seq[0].at)
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !/^\d+\s*[．.、]\s*[（(]\s*\d+\s*分\s*[）)]$/.test(l))
    .join("\n")
    .replace(/^\s*(?:\d+\s*[．.、]|[（(]\d+[）)])?\s*[①②③④⑤]?\s*[．.、]?\s*/, "")
    .replace(/[（(]\s*\d+\s*分\s*[）)]/g, "")
    .replace(/[（(]\s*[）)]/g, "")
    .replace(/．{2,}/g, "")
    .trim();
  return { stem, options };
}

const out = [];
const problems = [];
const answers = new Map(authority.questions.map((q) => [q.id, q]));
const wanted = [...authority.questions.filter((q) => q.id.split(":")[0].endsWith("-shici")).map((q) => q.id), ...WENXUE, ...MINGZHU];
for (const id of wanted) {
  const a = answers.get(id);
  const [rid, qi] = id.split(":");
  const record = records.get(rid);
  const question = record?.questions?.find((q) => String(q.qIndex) === qi);
  const isShici = rid.endsWith("-shici");
  if (!a || !record || !question) {
    problems.push(`MISSING ${id}`);
    continue;
  }
  // 詩詞題裡開放題、多選題本來就不收；文學常識與名著是逐題指定的，不合格就是錯
  const fail = (why) => (isShici ? null : problems.push(`${why} ${id}`));
  if (a.status !== "reviewed" || a.kind !== "single_choice" || a.correctOptions?.length !== 1) {
    fail("NOT-REVIEWED-SINGLE");
    continue;
  }
  if (!active.has(id)) {
    problems.push(`OUT-OF-RELEASE-SCOPE ${id}`);
    continue;
  }
  if (digest(record, question) !== a.inputSha256) {
    problems.push(`DIGEST-MISMATCH ${id}`);
    continue;
  }
  if (/教学修订版|非原卷/.test(question.text)) {
    if (!isShici) problems.push(`REVISED-NOT-ORIGINAL ${id}`);
    continue;
  }
  const p = parse(question.text);
  if (!p) {
    problems.push(`OPTIONS-UNPARSED ${id}`);
    continue;
  }
  const answer = a.correctOptions[0];
  if (!p.options.some((o) => o.key === answer)) {
    problems.push(`ANSWER-NOT-AN-OPTION ${id} ${answer}`);
    continue;
  }
  // 詩詞題的材料：新格式在 materials 陣列，舊格式在 material1–3；annotation 混有高考站的來源說明（「來源限定」「非原卷掃描」
  // 「題面經……交叉核對」），只保留原卷注釋
  const poems = record.materials?.length ? record.materials.map((m) => m.text) : [record.material1, record.material2, record.material3];
  const note = String(record.annotation || "")
    .split("\n")
    .filter((l) => !/^\s*来源限定/.test(l) && !/题面经.*交叉核对/.test(l))
    .map((l) => l.replace(/公开转载题源，非原卷扫描。?/g, "").trim())
    .filter(Boolean)
    .join("\n");
  const passage = isShici ? [...poems, note].filter((x) => typeof x === "string" && x.trim()).join("\n\n").trim() : "";
  if (isShici && passage.replace(/\s/g, "").length < 20) problems.push(`PASSAGE-MISSING ${id}`);
  const residue = /来源限定|非原卷|转录|重排|出版链|本站|教学修订版|交叉核对|题源|答\s*[:：]\s*[[［（(【]/u;
  if (residue.test(passage) || residue.test(p.stem) || p.options.some((o) => residue.test(o.text))) problems.push(`EDITORIAL-NOTE-LEFT ${id}`);
  // 延伸閱讀只收原文與辭書；題面出處（轉載、重排、掃描）與答案出處的條目標題是高考站的核對紀錄，不是給讀者的篇名
  const refs = (a.sources || []).filter((s) => s.url && CONTENT_REFS.includes(s.type)).map((s) => ({ type: s.type, title: s.title || s.label || "", url: s.url }));
  if (refs.some((r) => !r.title || residue.test(r.title) || /认证|核对|核實|核实/.test(r.title))) problems.push(`REFERENCE-TITLE ${id}`);
  const marked = markNote(id, record, p.stem);
  if (!marked.ok) problems.push(`MARKS-UNVERIFIED ${id}`);
  const lead = (s) => Number(String(s || "").match(/^\s*(\d{1,2})\s*[．.、（(]/)?.[1]) || null;
  const cur = a.modelAnswers?.[a.currentVersion];
  if (!cur?.text?.trim() || !MODEL_NAMES[cur.modelId]) problems.push(`REASONING-MISSING ${id}`);
  else {
    if (cur.inputSha256 !== a.inputSha256 || cur.inputContextSha256 !== a.inputContextSha256) problems.push(`REASONING-UNBOUND ${id}`);
    const said = cur.text.match(/^(?:答案[：:]?\s*|选\s*)([A-D])/)?.[1];
    if (said !== answer || (cur.selectedOptions && cur.selectedOptions.join("") !== answer)) problems.push(`REASONING-ANSWER ${id} ${said}`);
  }
  const reasoning = cur?.text ? trimReasoning(id, cur.text) : null;
  if (cur?.text && !reasoning) problems.push(`REASONING-TRIM ${id}`);
  if (reasoning && PROCESS_NOTE.test(reasoning.text)) problems.push(`REASONING-NOTE-LEFT ${id} ${reasoning.text.match(PROCESS_NOTE)[0]}`);
  out.push({
    id: `bj-${id.replace(":", "-")}`,
    gk_id: id,
    year: record.year,
    year_label: `${record.year}年北京卷`,
    q_num: Number(question.sourceQuestionNumber) || lead(question.text) || lead(record.topic) || null,
    category: isShici ? "古典詩歌" : MINGZHU.includes(id) ? "古典小說與戲曲" : "文學常識",
    passage,
    stem: marked.stem,
    options: p.options,
    answer,
    answer_status: "qualified_learning_reference",
    answer_reviewed_by: a.reviewedBy || "",
    answer_references: refs,
    reasoning: reasoning && { text: reasoning.text, excerpt: reasoning.excerpt, model: MODEL_NAMES[cur.modelId], model_id: cur.modelId, version: a.currentVersion },
    input_sha256: a.inputSha256,
  });
}
if (problems.length) {
  for (const p of problems) console.error(p);
  console.error(`FAILED: ${problems.length} problems (nothing written)`);
  process.exit(1);
}
out.sort((x, y) => x.year - y.year || (x.q_num || 0) - (y.q_num || 0) || (x.id < y.id ? -1 : 1));
const snap = {
  source: "高考站 gk.bdfz.net（ieduer/gaokao）已接受版本的北京卷語文題面與答案核查表",
  source_commit: COMMIT,
  source_files: { "data/all.json": sha(raw.all), "data/answer-authority.json": sha(raw.authority), "data/answer-release-scope.json": sha(raw.scope) },
  answer_qualification: { contract: authority.releaseQualification?.contract || "", originalPublicationVerified: authority.releaseQualification?.originalPublicationVerified ?? null, officialRubricVerified: authority.releaseQualification?.officialRubricVerified ?? null, note: "答案為學習參考：依公開解析與雙模型覆核，原考試機構答案出版鏈未證實。" },
  selection: { shici: "全部 reviewed 單選且在發布範圍內、非教學修訂版的詩詞鑑賞題", wenxue: WENXUE, mingzhu: MINGZHU, references: CONTENT_REFS, reasoning: "答案核查表 currentVersion 的模型作答（高考站給學生看的解析）；TRIM 只刪處理說明", trim: TRIM, marks: MARKS },
  questions: out,
};
fs.writeFileSync(path.join(ROOT, "data/raw/exams/bj-literature.json"), JSON.stringify(snap, null, 1) + "\n");
const by = {};
for (const q of out) by[q.category] = (by[q.category] || 0) + 1;
console.log(JSON.stringify({ questions: out.length, byCategory: by, years: [...new Set(out.map((q) => q.year))].length }));
