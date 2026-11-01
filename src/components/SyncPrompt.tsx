import { useState } from "react";
import { resolveConflict, useSync } from "../lib/cloud";

/** 本機有一份未登入的進度、帳號在別的裝置也有進度時問一次：併入（取聯集，兩邊都不少）或只用帳號進度（本機那份收進備份）。 */
export function SyncPrompt() {
  const s = useSync();
  const [busy, setBusy] = useState(false);
  if (s.status !== "conflict" || !s.conflict) return null;
  const { local, cloud } = s.conflict;
  const go = async (choice: "merge" | "adopt") => {
    setBusy(true);
    try {
      await resolveConflict(choice);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="sync-modal" role="dialog" aria-modal="true" aria-labelledby="sync-title">
      <section className="panel sync-card">
        <h2 id="sync-title">這台裝置上有一份未登入的進度</h2>
        <p>
          本機：{local.games} 局、收服 {local.mastered} 隻、學力 {local.xp}。
          <br />
          你的帳號{s.name ? `（${s.name}）` : ""}在雲端：{cloud.games} 局、收服 {cloud.mastered} 隻、學力 {cloud.xp}。
        </p>
        <p>要把本機這份併入帳號嗎？併入只會把兩邊的收服、星數、局數取聯集，不會少掉任何一邊。不併入的話，本機這份會原樣留在這台裝置的備份裡，之後改用帳號的進度。</p>
        <div className="row-form">
          <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void go("merge")}>
            併入帳號
          </button>
          <button type="button" className="btn" disabled={busy} onClick={() => void go("adopt")}>
            只用帳號進度
          </button>
        </div>
      </section>
    </div>
  );
}
