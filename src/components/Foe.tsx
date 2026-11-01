import { useEffect, useRef } from "react";
import type { CardMeta } from "../engine/types";
import { TIER_LABEL } from "../engine/types";
import { art, beastFor } from "../engine/art";
import { glyphPx } from "../engine/glyph";

export type FoeState = "idle" | "hit" | "dead" | "attack" | "enter";
export type FoeRole = "normal" | "elite" | "boss";

/** 書靈：一隻真正的妖獸從靈門裡探出，字浮在獸身之前。多字詞按字數縮小，永遠單行置中。指尖／滑鼠移動時獸身會跟著微微轉動（立體感）。 */
/** masked：作答中隱去書靈名號與副題。書靈的題目多半以這張卡本身為答案（誰寫的、哪一位得主），名號一露就洩題。 */
export function Foe({ card, role, state, hp, maxHp, masked = false }: { card: CardMeta; role: FoeRole; state: FoeState; hp: number; maxHp: number; masked?: boolean }) {
  const shown = masked ? "？" : card.w;
  const pct = Math.max(0, Math.min(100, (hp / Math.max(1, maxHp)) * 100));
  const base = role === "boss" ? 100 : 82;
  const beast = beastFor(card);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    let tx = 0;
    let ty = 0;
    let cx = 0;
    let cy = 0;
    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      tx = Math.max(-1, Math.min(1, (e.clientX - (r.left + r.width / 2)) / (r.width * 1.2)));
      ty = Math.max(-1, Math.min(1, (e.clientY - (r.top + r.height / 2)) / (r.height * 1.2)));
    };
    const onLeave = () => {
      tx = 0;
      ty = 0;
    };
    const tick = () => {
      cx += (tx - cx) * 0.08;
      cy += (ty - cy) * 0.08;
      el.style.setProperty("--rx", `${(-cy * 9).toFixed(2)}deg`);
      el.style.setProperty("--ry", `${(cx * 11).toFixed(2)}deg`);
      el.style.setProperty("--px", `${(cx * 8).toFixed(2)}px`);
      el.style.setProperty("--py", `${(cy * 6).toFixed(2)}px`);
      raf = requestAnimationFrame(tick);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerleave", onLeave);
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  return (
    <div className={`foe tier-${card.tier} role-${role} state-${state}`} aria-label={`書靈「${shown}」（${beast.name}）`}>
      <div className="foe-hp" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
        <div className="foe-hp-fill" style={{ width: `${pct}%` }} />
        <span className="foe-hp-text">
          {role === "boss" ? "頭目" : role === "elite" ? "精英" : TIER_LABEL[card.tier]} · {beast.name}
        </span>
      </div>
      <div className="foe-body" ref={ref}>
        <div className="foe-aura" aria-hidden="true" />
        <div className="foe-ring" aria-hidden="true" />
        <div className="foe-portal" aria-hidden="true">
          <img className="foe-beast" src={beast.src} alt="" decoding="async" />
          <span className="foe-shine" />
        </div>
        <span className="foe-glyph" lang="zh-Hant" style={{ fontSize: glyphPx(shown, base) }}>
          {shown}
        </span>
        {role === "boss" && <img className="foe-crown" src={art.crown} alt="" aria-hidden="true" decoding="async" />}
        {card.py && !masked && <span className="foe-py">{card.py}</span>}
        <span className="foe-sparks" aria-hidden="true">
          {Array.from({ length: 8 }, (_, k) => (
            <i key={k} style={{ "--i": k } as React.CSSProperties} />
          ))}
        </span>
      </div>
    </div>
  );
}
