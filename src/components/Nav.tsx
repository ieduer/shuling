import { art } from "../engine/art";

export type Tab = "home" | "journey" | "board" | "codex" | "me";

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "home", label: "對陣", icon: art.nav.home },
  { id: "journey", label: "旅程", icon: art.nav.journey },
  { id: "board", label: "排行", icon: art.nav.board },
  { id: "codex", label: "圖鑑", icon: art.nav.codex },
  { id: "me", label: "我的", icon: art.nav.me },
];

/** 底部分頁：五枚畫出來的銅錢圖標，選中的那枚亮起並微微浮起。 */
export function Nav({ tab, onChange }: { tab: Tab; onChange: (t: Tab) => void }) {
  return (
    <nav className="nav" aria-label="主選單">
      {TABS.map((t) => (
        <button key={t.id} type="button" className={`nav-btn${tab === t.id ? " is-active" : ""}`} onClick={() => onChange(t.id)} aria-current={tab === t.id ? "page" : undefined}>
          <span className="nav-coin">
            <img src={t.icon} alt="" width="34" height="34" decoding="async" />
          </span>
          <span className="nav-label">{t.label}</span>
        </button>
      ))}
    </nav>
  );
}
