export function TimerRing({ ms, limit }: { ms: number; limit: number }) {
  const frac = Math.max(0, Math.min(1, ms / limit));
  const r = 16;
  const c = 2 * Math.PI * r;
  const urgent = frac < 0.25;
  return (
    <div className={`timer${urgent ? " is-urgent" : ""}`} aria-label={`剩餘 ${Math.ceil(ms / 1000)} 秒`}>
      <svg viewBox="0 0 40 40" width="40" height="40" aria-hidden="true">
        <circle cx="20" cy="20" r={r} className="timer-track" />
        <circle cx="20" cy="20" r={r} className="timer-fill" strokeDasharray={c} strokeDashoffset={c * (1 - frac)} />
      </svg>
      <span className="timer-num">{Math.ceil(ms / 1000)}</span>
    </div>
  );
}
