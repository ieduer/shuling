import { useEffect, useMemo, useState } from "react";
import { art } from "../engine/art";
import { hashString } from "../engine/rng";

export type Scene = "home" | "journey" | "board" | "codex" | "me" | "battle" | "result";

const SRC: Record<Scene, string | null> = {
  home: art.bg.home,
  journey: null, // 旅程自己就是一整張地圖
  board: art.bg.board,
  codex: art.bg.codex,
  me: art.bg.me,
  battle: art.bg.battle,
  result: art.bg.result,
};

/** 全頁背景：一幅畫＋色系薄紗＋飄動的霧與靈光塵。畫換場時交叉淡入；靜態圖只載一次。 */
export function Backdrop({ scene }: { scene: Scene }) {
  const src = SRC[scene];
  const [shown, setShown] = useState<{ src: string | null; key: number }[]>(() => [{ src, key: 0 }]);

  useEffect(() => {
    setShown((list) => {
      const last = list[list.length - 1];
      if (last.src === src) return list;
      return [...list.slice(-1), { src, key: last.key + 1 }];
    });
    // 交叉淡入結束後只留最新的一張（動畫被關掉時 animationend 不會來，用計時器兜底）
    const t = window.setTimeout(() => setShown((list) => list.slice(-1)), 1200);
    return () => window.clearTimeout(t);
  }, [src]);

  const motes = useMemo(
    () =>
      Array.from({ length: 22 }, (_, k) => {
        const h = hashString(`mote|${k}`);
        return {
          k,
          x: (h & 0xff) / 2.55,
          d: 14 + ((h >> 8) & 0xff) / 12,
          s: 2 + ((h >> 16) & 0x7),
          delay: -(((h >> 20) & 0xff) / 255) * 20,
        };
      }),
    [],
  );

  return (
    <div className={`backdrop scene-${scene}`} aria-hidden="true">
      {shown.map((s) =>
        s.src ? <img key={s.key} className="bd-img" src={s.src} alt="" decoding="async" /> : <span key={s.key} className="bd-img bd-none" />,
      )}
      <span className="bd-veil" />
      <span className="bd-mist bd-mist-a" />
      <span className="bd-mist bd-mist-b" />
      <span className="bd-motes">
        {motes.map((m) => (
          <i key={m.k} style={{ "--x": `${m.x}%`, "--d": `${m.d}s`, "--s": `${m.s}px`, "--delay": `${m.delay}s` } as React.CSSProperties} />
        ))}
      </span>
    </div>
  );
}
