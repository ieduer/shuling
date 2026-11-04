import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RunRequest } from "../App";
import { Explain } from "../components/Explain";
import { Foe, type FoeRole, type FoeState } from "../components/Foe";
import { TimerRing } from "../components/Timer";
import { Sentence } from "../components/WordCard";
import { toast } from "../components/Toast";
import { bank, cardById, getQuestions } from "../engine/bank";
import { burst, centerOf, flash, shake } from "../engine/fx";
import { planDaily, planFree, planLesson, planWrong } from "../engine/planner";
import { getProgress, recordAnswer } from "../engine/progress";
import { rngFrom, shuffle } from "../engine/rng";
import { LIMIT_MS, limitOf, questionScore } from "../engine/score";
import { sfx } from "../engine/sfx";
import { TYPE_LABEL, type Question, type RunAnswer, type RunSummary } from "../engine/types";
import { Logo } from "../components/Logo";
import { art, beastFor, warm } from "../engine/art";

type Phase = "loading" | "enter" | "ask" | "reveal" | "done";
const MAX_HP = 3;
const MAX_MANA = 6;
const MOVE_NAME: Record<string, string> = { who: "識靈訣", work: "尋卷擊", line: "名句刃", era: "溯時環", kw: "星辭斬", lang: "通言擊", year: "紀年訣", exam: "破陣訣" };

interface Skill {
  id: "zhuzhao" | "zhishui" | "shenji";
  name: string;
  cost: number;
  hint: string;
}
const SKILLS: Skill[] = [
  { id: "zhuzhao", name: "燭照", cost: 2, hint: "劃掉一個錯誤招式" },
  { id: "zhishui", name: "止水", cost: 1, hint: "時間回流 8 秒" },
  { id: "shenji", name: "神機", cost: 3, hint: "窺見書靈線索" },
];

function roleOf(index: number, total: number, tier: string): FoeRole {
  if (index === total - 1 && (tier === "SSR" || tier === "SR")) return "boss";
  if (tier === "SR" || tier === "SSR") return "elite";
  return "normal";
}

export function Battle({ request, onFinish, onQuit }: { request: RunRequest; onFinish: (s: RunSummary) => void; onQuit: () => void }) {
  const [qs, setQs] = useState<Question[] | null>(null);
  const [i, setI] = useState(0);
  const [phase, setPhase] = useState<Phase>("loading");
  const [foeState, setFoeState] = useState<FoeState>("enter");
  const [left, setLeft] = useState(LIMIT_MS);
  const [picked, setPicked] = useState("");
  const [combo, setCombo] = useState(0);
  const [score, setScore] = useState(0);
  const [hp, setHp] = useState(MAX_HP);
  const [mana, setMana] = useState(1);
  const [struck, setStruck] = useState<string[]>([]); // 燭照劃掉的選項
  const [hint, setHint] = useState<string>("");
  const [dmg, setDmg] = useState<{ n: number; key: number; crit: boolean } | null>(null);
  const [slash, setSlash] = useState(0);
  const [defeated, setDefeated] = useState(false);
  const answers = useRef<RunAnswer[]>([]);
  const newCards = useRef<string[]>([]);
  const startedAt = useRef(Date.now());
  const qStart = useRef(0);
  const bonusMs = useRef(0);
  const maxCombo = useRef(0);
  const arenaRef = useRef<HTMLDivElement>(null);
  const autoRef = useRef<number>(0);
  const daily = request.mode === "daily";

  useEffect(() => {
    let alive = true;
    const p = getProgress();
    const ids =
      request.mode === "daily"
        ? planDaily(request.seed)
        : request.mode === "wrong"
          ? planWrong(p, request.seed)
          : request.mode === "lesson"
            ? planLesson(p, request.scope, request.seed)
            : planFree(p, request.scope, request.seed);
    getQuestions(ids)
      .then((list) => {
        if (!alive) return;
        if (!list.length) {
          toast("這個範圍還沒有書靈出沒，換一個試試", "bad");
          onQuit();
          return;
        }
        setQs(list);
        // 先把本局會出場的書靈獸都暖進快取，靈門打開時獸已在裡面
        warm([...new Set(list.map((x) => cardById.get(x.c)).filter((c): c is NonNullable<typeof c> => !!c).map((c) => beastFor(c).src))]);
        enterFoe();
      })
      .catch(() => {
        if (!alive) return;
        toast("書靈召喚失敗，請檢查網路", "bad");
        onQuit();
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request, onQuit]);

  function enterFoe() {
    setFoeState("enter");
    setPhase("enter");
    sfx.flip();
    window.setTimeout(() => {
      setFoeState("idle");
      setPhase("ask");
      qStart.current = performance.now();
      bonusMs.current = 0;
    }, 650);
  }

  const q = qs?.[i];
  const card = q ? cardById.get(q.c) : undefined;
  const role: FoeRole = q && card ? roleOf(i, qs!.length, card.tier) : "normal";

  // 真題照原卷次序、標原卷字母（答案與解析逐項以 A–D 指稱）；其他題型洗牌、標甲乙丙丁
  const keyOf = useMemo(() => new Map(q?.keys ? q.opts.map((o, k) => [o, q.keys![k]] as const) : []), [q]);
  const options = useMemo(() => {
    if (!q) return [];
    if (q.keys) return [...q.opts].sort((x, y) => keyOf.get(x)!.localeCompare(keyOf.get(y)!));
    const rand = rngFrom(`${request.seed}|${q.id}`);
    return shuffle(q.opts, rand);
  }, [q, keyOf, request.seed]);

  // 倒數
  useEffect(() => {
    if (phase !== "ask") return;
    setLeft(limitOf(q?.t ?? "who")); // 每題從自己的限時起算（真題 90 秒），不沿用上一題或初始的 20 秒
    let raf = 0;
    const tick = () => {
      const elapsed = performance.now() - qStart.current - bonusMs.current;
      const remain = Math.max(0, limitOf(q?.t ?? "who") - elapsed);
      setLeft(remain);
      if (remain <= 0) {
        answer("");
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, i]);

  const answer = useCallback(
    (pick: string) => {
      if (!q || !card || phase !== "ask") return;
      const ms = Math.round(performance.now() - qStart.current - bonusMs.current);
      const correct = pick !== "" && pick === q.opts[0];
      const nextCombo = correct ? combo + 1 : 0;
      const gained = questionScore({ correct, tier: card.tier, type: q.t, ms, combo: nextCombo });
      const { newCard, mastered } = recordAnswer(q, card, correct);
      if (newCard) newCards.current.push(card.id);
      answers.current.push({ q: q.id, pick, ms, correct, score: gained, combo: nextCombo });
      maxCombo.current = Math.max(maxCombo.current, nextCombo);
      setPicked(pick);
      setCombo(nextCombo);
      setPhase("reveal");
      const c = centerOf(arenaRef.current?.querySelector(".foe-glyph") ?? null);
      if (correct) {
        const crit = ms < limitOf(q.t) * 0.35;
        setScore((s) => s + gained);
        setDmg({ n: gained, key: Date.now(), crit });
        setSlash(Date.now());
        setFoeState("hit");
        burst(c.x, c.y, card.tier === "SSR" ? "gold" : card.tier === "SR" ? "jade" : "ink", card.tier === "SSR" ? 56 : 32);
        flash("good");
        sfx.correct(nextCombo);
        let gainMana = 1 + (nextCombo > 0 && nextCombo % 3 === 0 ? 1 : 0);
        setMana((m) => Math.min(MAX_MANA, m + gainMana));
        if (nextCombo > 0 && nextCombo % 5 === 0) {
          sfx.combo();
          toast(`${nextCombo} 連擊！神思湧現`, "gold");
          gainMana++;
        }
        if (mastered) toast(`「${card.w}」書靈已被你徹底收服`, "gold");
        window.setTimeout(() => setFoeState("dead"), 420);
        autoRef.current = window.setTimeout(() => next(false), 1700);
      } else {
        setFoeState("attack");
        shake(pick ? "soft" : "hard");
        flash("bad");
        sfx.wrong();
        burst(c.x, c.y + 120, "red", 18);
        const nextHp = hp - 1;
        setHp(nextHp);
        if (nextHp <= 0) {
          setDefeated(true);
          window.setTimeout(() => setFoeState("idle"), 500);
        } else {
          window.setTimeout(() => setFoeState("idle"), 500);
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [q, card, phase, combo, hp],
  );

  const finish = useCallback(
    (lost: boolean) => {
      setPhase("done");
      const list = answers.current;
      onFinish({
        mode: request.mode,
        seed: request.seed,
        scope: request.scope,
        startedAt: startedAt.current,
        finishedAt: Date.now(),
        answers: list,
        score: list.reduce((a, b) => a + b.score, 0),
        correct: list.filter((a) => a.correct).length,
        total: qs?.length ?? list.length,
        maxCombo: maxCombo.current,
        newCards: newCards.current,
        lost,
      });
    },
    [onFinish, request, qs],
  );

  const next = useCallback(
    (fromUser: boolean) => {
      window.clearTimeout(autoRef.current);
      if (!qs) return;
      if (defeated && fromUser) {
        finish(true);
        return;
      }
      if (i + 1 >= qs.length) {
        finish(false);
        return;
      }
      setI(i + 1);
      setPicked("");
      setStruck([]);
      setHint("");
      setLeft(limitOf(qs[i + 1]?.t ?? "who"));
      enterFoe();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [qs, i, defeated, finish],
  );

  function useSkill(s: Skill) {
    if (daily || phase !== "ask" || mana < s.cost || !q) return;
    if (s.id === "zhuzhao") {
      const wrongLeft = options.filter((o) => o !== q.opts[0] && !struck.includes(o));
      if (!wrongLeft.length) return;
      const rand = rngFrom(`${request.seed}|${q.id}|zhuzhao|${struck.length}`);
      setStruck([...struck, wrongLeft[Math.floor(rand() * wrongLeft.length)]]);
    } else if (s.id === "zhishui") {
      bonusMs.current += 8000;
    } else {
      // 時代題只給作品線索（時代標籤就是答案）；其他題給時代／授獎辭分期與卡上的事實提要
      const clues = [...(q.t === "era" ? [] : card?.lists || []), ...(card?.senses || []).slice(0, 2)].filter((x) => !q.opts[0].includes(x) && !x.includes(q.opts[0]));
      setHint(clues.length ? `線索：${clues.join("／")}` : "這隻書靈沒有更多線索");
    }
    setMana((m) => m - s.cost);
    sfx.reveal();
    toast(`${s.name}！`, "gold");
  }

  useEffect(() => () => window.clearTimeout(autoRef.current), []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.target as HTMLElement | null)?.tagName === "INPUT") return;
      if (phase === "ask") {
        const idx = "1234".indexOf(e.key) >= 0 ? "1234".indexOf(e.key) : "abcd".indexOf(e.key.toLowerCase());
        if (idx >= 0 && options[idx] !== undefined && !struck.includes(options[idx])) {
          e.preventDefault();
          answer(options[idx]);
        }
      } else if (phase === "reveal" && (e.key === "Enter" || e.key === " " || e.key === "ArrowRight")) {
        e.preventDefault();
        next(true);
      }
      if (e.key === "Escape") onQuit();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, options, struck, answer, next, onQuit]);

  if (!qs || !q || !card) {
    return (
      <div className="battle battle-loading">
        <div className="loading-seal">
          <Logo size={72} />
        </div>
        <p>書靈聚形中…</p>
      </div>
    );
  }

  const correct = picked === q.opts[0];
  const bookLabel = bank.books.find((b) => b.id === q.book)?.label || "";
  const long = q.t === "line" || q.t === "kw";

  return (
    <div className={`battle role-${role}`}>
      <header className="battle-top">
        <button type="button" className="btn-ghost battle-quit" onClick={onQuit} aria-label="撤退">
          ✕
        </button>
        <ol className="path" aria-label="陣程">
          {qs.map((x, k) => {
            const a = answers.current[k];
            const c = cardById.get(x.c);
            const r = c ? roleOf(k, qs.length, c.tier) : "normal";
            return <li key={x.id} className={`node node-${r}${k === i ? " is-now" : ""}${a ? (a.correct ? " is-won" : " is-lost") : ""}`} title={a ? c?.w : undefined} />;
          })}
        </ol>
        <div className="battle-meta">
          <span className="battle-label">{request.label}</span>
          <span className="battle-book">{bookLabel}</span>
        </div>
        <div className={`combo${combo >= 3 ? " is-hot" : ""}`} aria-label={`連擊 ${combo}`}>
          <span className="combo-n">{combo}</span>
          <span className="combo-t">連擊</span>
        </div>
        <TimerRing ms={phase === "ask" ? left : 0} limit={q ? limitOf(q.t) : LIMIT_MS} />
      </header>

      <div className="arena" ref={arenaRef}>
        <Foe card={card} role={role} state={foeState} hp={phase === "reveal" && correct ? 0 : 100} maxHp={100} masked={phase !== "reveal"} />
        {dmg && (
          <div key={dmg.key} className={`dmg${dmg.crit ? " is-crit" : ""}`}>
            {dmg.crit ? "暴擊 " : ""}-{dmg.n}
          </div>
        )}
        {slash > 0 && phase === "reveal" && correct && <div key={slash} className="slash" aria-hidden="true" />}
        <div className="score-now" aria-label={`本局得分 ${score}`}>
          <span className="score-now-n">{score}</span>
          <span className="score-now-t">分</span>
        </div>
        <div className="party" aria-label={`燭火 ${hp}，神思 ${mana}`}>
          <div className="hp">
            {Array.from({ length: MAX_HP }, (_, k) => (
              <img key={k} className={`candle${k < hp ? " is-lit" : ""}`} src={art.candle} alt="" aria-hidden="true" decoding="async" />
            ))}
          </div>
          <div className="mana">
            <span className="mana-t">神思</span>
            <span className="mana-dots">
              {Array.from({ length: MAX_MANA }, (_, k) => (
                <img key={k} className={k < mana ? "is-on" : ""} src={art.mana} alt="" decoding="async" />
              ))}
            </span>
          </div>
        </div>
      </div>

      <div className={`spell${long ? " is-long" : ""}`}>
        <Sentence s={q.s} className={long ? "is-compare" : ""} />
        <p className="spell-stem">{q.stem.replace(/^依課文語境，標出的/, "").replace(/在這裡應解為？$/, "在此解為？")}</p>
        {q.fig?.map((f) => (
          <figure key={f.src} className="spell-fig">
            <a href={f.src} target="_blank" rel="noreferrer" aria-label={`放大：${f.alt}`}>
              <img src={f.src} alt={f.alt} width={f.w} height={f.h} decoding="async" />
            </a>
            <figcaption>{f.cap}</figcaption>
          </figure>
        ))}
        <p className="spell-meta">
          {/* 只標域名與題型：關卡名含時代或年份區間，時代題、年份題會被它洩題 */}
          {q.src.label} · {TYPE_LABEL[q.t]}
        </p>
        {hint && <p className="spell-hint">{hint}</p>}
      </div>

      <div className={`moves${long ? " is-long" : ""}`} role="group" aria-label="招式">
        {options.map((o, k) => {
          const isAnswer = o === q.opts[0];
          const isPicked = o === picked;
          const isStruck = struck.includes(o);
          const cls = ["move", phase === "reveal" && isAnswer ? "is-answer" : "", phase === "reveal" && isPicked && !isAnswer ? "is-wrong" : "", isStruck ? "is-struck" : ""].filter(Boolean).join(" ");
          return (
            <button key={o} type="button" className={cls} disabled={phase !== "ask" || isStruck} onClick={() => answer(o)} style={{ animationDelay: `${k * 60}ms` }}>
              <span className="move-key">{keyOf.get(o) ?? "甲乙丙丁"[k]}</span>
              <span className="move-text">{o}</span>
            </button>
          );
        })}
      </div>

      {!daily && (
        <div className="skills" aria-label="文心術">
          {SKILLS.map((s) => (
            <button key={s.id} type="button" className={`skill${mana >= s.cost && phase === "ask" ? " is-ready" : ""}`} disabled={phase !== "ask" || mana < s.cost} onClick={() => useSkill(s)} title={s.hint}>
              <img className="skill-icon" src={art.skill[s.id]} alt="" decoding="async" />
              <span className="skill-name">{s.name}</span>
              <span className="skill-cost">
                {Array.from({ length: s.cost }, (_, k) => (
                  <img key={k} src={art.mana} alt="" decoding="async" />
                ))}
              </span>
            </button>
          ))}
        </div>
      )}

      {phase === "reveal" && (
        <Explain
          q={q}
          card={card}
          correct={correct}
          picked={picked}
          onNext={() => next(true)}
          autoMs={correct ? 1700 : undefined}
          title={correct ? `${MOVE_NAME[q.t] || "出招"}命中` : defeated ? "燭火燃盡" : `燭火餘 ${hp}`}
          nextLabel={defeated ? "帶著戰利品回營" : i + 1 >= qs.length ? "結算戰果" : "下一隻"}
        />
      )}
    </div>
  );
}
