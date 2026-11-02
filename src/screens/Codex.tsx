import { useMemo, useState } from "react";
import { CardFace, MiniCard } from "../components/WordCard";
import { art, beastFor, REGIONS } from "../engine/art";
import { bank, questionsOfCard } from "../engine/bank";
import { cardLevel, useProgress } from "../engine/progress";
import { TIER_LABEL, type CardMeta, type Tier } from "../engine/types";

const TIERS: Tier[] = ["SSR", "SR", "R", "N"];
const PAGE = 24;

interface Zone {
  id: string;
  name: string;
  sub: string;
  img: string;
  books: string[];
}

function zones(): Zone[] {
  // 十四域（中文四域、萬國九個海區、真卷殿）
  return REGIONS.filter((r) => r.books.some((b) => bank.books.some((x) => x.id === b))).map((r) => ({ id: r.id, name: r.name, sub: r.sub, img: r.map, books: r.books }));
}

/** 圖鑑：先選一域（十四域），域內再按稀有度分區，每區先看一頁，想看再翻，不整本往下拉。 */
export function Codex() {
  const p = useProgress();
  const zs = useMemo(zones, []);
  const [zone, setZone] = useState(zs[0]?.id ?? "ms");
  const [q, setQ] = useState("");
  const [onlyMine, setOnlyMine] = useState(false);
  const [open, setOpen] = useState<CardMeta | null>(null);
  const [pages, setPages] = useState<Record<string, number>>({});
  const [folded, setFolded] = useState<Record<string, boolean>>({});

  const search = q.trim();
  const list = useMemo(() => {
    let cards = bank.cards;
    if (search) cards = cards.filter((c) => c.w.includes(search) || c.key.includes(search) || c.senses.some((x) => x.includes(search)));
    else { const zb = zs.find((z) => z.id === zone)?.books ?? [zone]; cards = cards.filter((c) => c.books.some((b) => zb.includes(b))); }
    if (onlyMine) cards = cards.filter((c) => p.cards[c.id]);
    return cards;
  }, [zone, search, onlyMine, p.cards]);

  const groups = TIERS.map((t) => ({ t, cards: list.filter((c) => c.tier === t) })).filter((g) => g.cards.length);
  const seenAll = Object.keys(p.cards).length;
  const mastered = Object.values(p.cards).filter((c) => c.masteredAt).length;
  const openStat = open ? p.cards[open.id] : undefined;
  const openBeast = open ? beastFor(open) : undefined;

  const zoneBooks = (id: string) => zs.find((z) => z.id === id)?.books ?? [id];
  function zoneSeen(id: string): number {
    let n = 0;
    const zb = zoneBooks(id);
    for (const c of bank.cards) if (c.books.some((b) => zb.includes(b)) && p.cards[c.id]) n++;
    return n;
  }
  function zoneTotal(id: string): number {
    const zb = zoneBooks(id);
    return bank.cards.filter((c) => c.books.some((b) => zb.includes(b))).length;
  }

  return (
    <div className="codex">
      <header className="codex-head">
        <div className="codex-title">
          <h1>書靈圖鑑</h1>
          <span className="codex-count">
            <b>{seenAll}</b>/{bank.cards.length} · 收服 <b>{mastered}</b>
          </span>
        </div>
        <div className="zones" role="tablist" aria-label="分區">
          {zs.map((z) => (
            <button key={z.id} type="button" role="tab" aria-selected={zone === z.id && !search} className={`zone${zone === z.id && !search ? " is-on" : ""}`} onClick={() => setZone(z.id)}>
              <img src={z.img} alt="" decoding="async" loading="lazy" />
              <span className="zone-name" lang="zh-Hant">
                {z.name}
              </span>
              <span className="zone-sub">
                {z.sub} · {zoneSeen(z.id)}/{zoneTotal(z.id)}
              </span>
            </button>
          ))}
        </div>
        <div className="codex-tools">
          <input className="input" placeholder="搜字、搜義（搜全部分區）" value={q} onChange={(e) => setQ(e.target.value)} />
          <button type="button" className={`chip${onlyMine ? " is-on" : ""}`} onClick={() => setOnlyMine((v) => !v)} aria-pressed={onlyMine}>
            已遇見
          </button>
        </div>
      </header>

      {groups.length === 0 && <p className="muted codex-empty">{search ? "沒有這個書靈" : "這一域還沒遇見書靈"}</p>}

      {groups.map((g) => {
        const key = `${search ? "q" : zone}|${g.t}`;
        const shown = Math.min(g.cards.length, (pages[key] || 1) * PAGE);
        const fold = !!folded[g.t];
        const got = g.cards.filter((c) => p.cards[c.id]).length;
        return (
          <section key={g.t} className={`tier-group tier-${g.t}${fold ? " is-folded" : ""}`}>
            <button type="button" className="tier-head" onClick={() => setFolded((f) => ({ ...f, [g.t]: !f[g.t] }))} aria-expanded={!fold}>
              <img className="gem" src={art.gem[g.t]} alt="" decoding="async" />
              <b>{TIER_LABEL[g.t]}</b>
              <span>
                {got}/{g.cards.length}
              </span>
              <i className="tier-chev" aria-hidden="true" />
            </button>
            {!fold && (
              <>
                <div className="codex-grid">
                  {g.cards.slice(0, shown).map((c) => (
                    <MiniCard key={c.id} card={c} level={cardLevel(p.cards[c.id])} onClick={() => setOpen(c)} />
                  ))}
                </div>
                {shown < g.cards.length && (
                  <button type="button" className="btn codex-more" onClick={() => setPages((x) => ({ ...x, [key]: (x[key] || 1) + 1 }))}>
                    再看 {Math.min(PAGE, g.cards.length - shown)} 隻（還有 {g.cards.length - shown}）
                  </button>
                )}
              </>
            )}
          </section>
        );
      })}

      {open && openBeast && (
        <div className="modal" role="dialog" aria-modal="true" onClick={() => setOpen(null)}>
          <div className={`modal-card detail tier-${open.tier}`} onClick={(e) => e.stopPropagation()}>
            <button type="button" className="btn-ghost modal-close" onClick={() => setOpen(null)} aria-label="關閉">
              ✕
            </button>
            <div className="detail-head">
              <div className={`mini detail-card tier-${open.tier}${openStat?.masteredAt ? " is-mastered" : ""}${openStat ? "" : " is-locked"}`}>
                <CardFace card={open} level={cardLevel(openStat)} base={52} />
              </div>
              <div className="detail-meta">
                <div className="detail-py">{open.py}</div>
                <div className={`detail-tier tier-${open.tier}`}>
                  <img className="gem" src={art.gem[open.tier]} alt="" decoding="async" />
                  {TIER_LABEL[open.tier]} · {openBeast.name} · {open.kind === "person" ? "人靈" : open.kind === "group" ? "合璧" : open.kind === "term" ? "論靈" : "卷靈"} · {questionsOfCard(open.id).length} 題
                </div>
                <div className="detail-stats">{openStat ? `答對 ${openStat.ok} · 答錯 ${openStat.bad}${openStat.masteredAt ? " · 已收服" : ""}` : "尚未遇見"}</div>
                {open.lists.length > 0 && <div className="detail-lists">{open.lists.join(" · ")}</div>}
              </div>
            </div>
            <ul className="detail-senses">
              {open.senses.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
            {open.sw && (
              <p className="detail-sw" lang="zh-Hant">
                <b>說文</b>（{open.sw.bu}部）{open.sw.text}
              </p>
            )}
            <p className="detail-foot">
              {open.books
                .map((b) => bank.books.find((x) => x.id === b)?.label)
                .filter(Boolean)
                .join("、")}
              {open.dictUrl && (
                <a className="link" href={open.dictUrl} target="_blank" rel="noreferrer">
                  延伸閱讀 ↗
                </a>
              )}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
