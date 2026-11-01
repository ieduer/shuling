import { useEffect, useState } from "react";

interface ToastItem {
  id: number;
  text: string;
  kind: "info" | "gold" | "bad";
}

let seq = 0;
const listeners = new Set<(t: ToastItem) => void>();

export function toast(text: string, kind: ToastItem["kind"] = "info"): void {
  const item = { id: ++seq, text, kind };
  for (const l of listeners) l(item);
}

export function Toasts() {
  const [items, setItems] = useState<ToastItem[]>([]);
  useEffect(() => {
    const on = (t: ToastItem) => {
      setItems((xs) => [...xs, t].slice(-3));
      window.setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== t.id)), 2600);
    };
    listeners.add(on);
    return () => {
      listeners.delete(on);
    };
  }, []);
  if (!items.length) return null;
  return (
    <div className="toasts" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className={`toast toast-${t.kind}`}>
          {t.text}
        </div>
      ))}
    </div>
  );
}
