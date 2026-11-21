import { useEffect, useState } from "react";
import { bestSite, fetchTotal, HERE, logoSrc, sealSrc, siteCount, type TotalResult, type TotalRow, type TotalSite } from "../engine/total";

/** 每站一枚段位徽章（各站自己的真圖）；沒玩過的站顯示該站第一階徽章的灰影 */
function Seals({ row, sites, size, cols }: { row: TotalRow; sites: TotalSite[]; size: number; cols?: number }) {
  return (
    <span className="total-seals" style={cols ? { gridTemplateColumns: `repeat(${cols}, auto)` } : undefined}>
      {sites.map((s, i) => {
        const x = row.t[i];
        return x ? (
          <img key={s.key} className={s.key === HERE ? "is-here" : undefined} src={sealSrc(s, x[0])} alt={`${s.name}${s.ranks[x[0]] ?? ""}`} title={`${s.title}・${s.ranks[x[0]] ?? ""}・${x[1]} 分`} width={size} height={size} decoding="async" loading="lazy" />
        ) : (
          <img key={s.key} className="is-empty" src={sealSrc(s, 0)} alt="" title={`${s.title}・未上場`} width={size} height={size} decoding="async" loading="lazy" />
        );
      })}
    </span>
  );
}

function BigSeal({ row, sites, size }: { row: TotalRow; sites: TotalSite[]; size: number }) {
  const i = bestSite(row);
  const s = sites[i];
  const x = row.t[i];
  if (!s || !x) return null;
  return <img className="total-big" src={sealSrc(s, x[0])} alt={`${s.name}${s.ranks[x[0]] ?? ""}`} width={size} height={size} decoding="async" />;
}

/** 排行榜「六靈」分頁：各站段位相加的總榜（靈山 /api/total；2026-11-21 起含義戰論語） */
export function TotalBoard() {
  const [data, setData] = useState<TotalResult | null | "loading">("loading");

  useEffect(() => {
    let alive = true;
    fetchTotal()
      .then((r) => alive && setData(r))
      .catch(() => alive && setData(null));
    return () => {
      alive = false;
    };
  }, []);

  if (data === "loading") return <p className="muted board-empty">召集六靈中…</p>;
  if (!data) return <p className="muted board-empty">六靈總榜暫時連不上</p>;

  const { sites, rows, me } = data;
  const podium = rows.length >= 3 ? [rows[1], rows[0], rows[2]] : [];
  const rest = rows.length >= 3 ? rows.slice(3) : rows;
  return (
    <div className="total">
      <p className="board-note">{siteCount(sites.length)}站段位相加：任一站每升一階記 {data.perTier} 分，階內按該站進度比例。登入 my.bdfz.net 的帳號合計各站；沒登入的玩家只計所在那一站。各站自己的榜不變。</p>
      <ul className="total-sites" style={{ gridTemplateColumns: `repeat(${sites.length}, minmax(0, 1fr))` }}>
        {sites.map((s) => (
          <li key={s.key} className={`total-site${s.key === HERE ? " is-here" : ""}${s.ok ? "" : " is-off"}`}>
            <a href={s.url} target={s.key === HERE ? undefined : "_blank"} rel="noreferrer" lang="zh-Hant">
              <img src={logoSrc(s)} alt="" width={34} height={34} decoding="async" />
              <span className="total-site-name">{s.name}</span>
              <span className="total-site-n">{s.ok ? `${s.players} 人` : "連不上"}</span>
            </a>
          </li>
        ))}
      </ul>

      {podium.length > 0 && (
        <ol className="podium total-podium">
          {podium.map((r, k) => (
            <li key={r.rank} className={`podium-${r.rank}${r.me ? " is-me" : ""}`}>
              <span className="podium-rank">{r.rank}</span>
              <BigSeal row={r} sites={sites} size={k === 1 ? 60 : 46} />
              <span className="podium-nick">{r.nick || "無名氏"}</span>
              <span className="podium-score">{r.score}</span>
              <Seals row={r} sites={sites} size={18} cols={Math.ceil(sites.length / 2)} />
            </li>
          ))}
        </ol>
      )}
      <ol className="total-rows" start={podium.length ? 4 : 1}>
        {rest.map((r) => (
          <li key={r.rank} className={`total-row${r.me ? " is-me" : ""}${r.anon ? " is-anon" : ""}`}>
            <span className="row-rank">{r.rank}</span>
            <span className="total-who">
              <span className="row-nick">{r.nick || "無名氏"}</span>
              <Seals row={r} sites={sites} size={22} />
            </span>
            <span className="row-score">{r.score}</span>
          </li>
        ))}
      </ol>
      {rows.length === 0 && <p className="board-empty">還沒有登入帳號上榜</p>}
      {me && !rows.some((r) => r.me) && (
        <div className={`total-row is-me row-mine${me.anon ? " is-anon" : ""}`}>
          <span className="row-rank">{me.rank}</span>
          <span className="total-who">
            <span className="row-nick">{me.nick || "你"}</span>
            <Seals row={me} sites={sites} size={22} />
          </span>
          <span className="row-score">{me.score}</span>
        </div>
      )}
      {data.viewer === "anonymous" && me && <p className="board-note total-hint">你沒登入，這裡只計本站成績；登入 my.bdfz.net 後，各站戰績合成一列。</p>}
      {data.viewer === "anonymous" && !me && <p className="board-note total-hint">在本站打完一局就會上榜；登入 my.bdfz.net 後，各站戰績合成一列。</p>}
      {data.viewer === "unavailable" && !me && <p className="board-note total-hint">用戶中心暫時連不上，認不出哪一列是你。</p>}
      {data.viewer === "user" && !me && <p className="board-note total-hint">你已登入；在任一站打完一局就會上榜。</p>}
      {data.partial && <p className="board-note total-hint">有一站暫時讀不到，這一站的分數稍後補上。</p>}
      <p className="board-foot">{data.entries ?? data.accounts} 位上榜・{data.accounts} 個登入帳號合計各站</p>
    </div>
  );
}
