import type { CardMeta, Question } from "../engine/types";

/** 出處標籤去掉冗長的教科書全名，手機上一行放得下 */
function shortLabel(label: string): string {
  return label
    .replace(/^普通高中教科[書书]語文/, "")
    .replace(/^(?:統編|统编)?義務教育教科[書书]語文/, "")
    .replace(/^《(.+?)》第三版「(.+?)」條義項(\d+)$/, "「$2」條義項$3");
}

const ROLE_LABEL: Record<string, string> = {
  textbook: "課本",
  exam: "真題",
  dictionary: "辭源",
  "function-dictionary": "虛詞詞典",
  shuowen: "說文",
  grammar: "講義",
  official: "官方",
  structured: "Wikidata",
  editorial: "本站",
  reference: "延伸",
};

/** 解析底板：正解、一句說明、出處一行（每個來源一枚標籤，有網址的可點）。 */
export function Explain({
  q,
  card,
  correct,
  picked,
  onNext,
  autoMs,
  title,
  nextLabel,
}: {
  q: Question;
  card: CardMeta;
  correct: boolean;
  picked: string;
  onNext: () => void;
  autoMs?: number;
  title?: string;
  nextLabel?: string;
}) {
  const plain = q.sources.filter((s) => !s.note);
  const quoted = q.sources.filter((s) => s.note);
  return (
    <section className={`explain ${correct ? "is-good" : "is-bad"}`} aria-live="polite">
      <div className="explain-head">
        <span className="explain-verdict">{correct ? "命中" : picked ? "落空" : "逾時"}</span>
        <span className="explain-title">{title}</span>
      </div>
      <p className="explain-answer">
        <b>{q.opts[0]}</b>
        {!correct && picked && <span className="explain-picked">你選了「{picked}」</span>}
      </p>
      <p className="explain-why">{q.why}</p>
      {plain.length > 0 && (
        <p className="explain-refs">
          {plain.map((s, i) => (
            <span key={i} className={`ref ref-${s.role}`}>
              {s.url ? (
                <a href={s.url} target="_blank" rel="noreferrer">
                  {ROLE_LABEL[s.role] || s.role} · {shortLabel(s.label)}
                </a>
              ) : (
                <>
                  {ROLE_LABEL[s.role] || s.role} · {shortLabel(s.label)}
                </>
              )}
            </span>
          ))}
        </p>
      )}
      {quoted.map((s, i) => (
        <details key={i} className={`ref-more ref-${s.role}`}>
          <summary>
            {ROLE_LABEL[s.role] || s.role} · {shortLabel(s.label)}
          </summary>
          <p lang="zh-Hant">{s.note}</p>
          {s.url && (
            <a href={s.url} target="_blank" rel="noreferrer">
              原條 ↗
            </a>
          )}
        </details>
      ))}
      {card.senses.length > 0 && <p className="explain-senses">{card.w}：{card.senses.filter((x) => x !== q.opts[0]).slice(0, 4).join("／")}</p>}
      <button type="button" className="btn btn-primary explain-next" onClick={onNext}>
        {autoMs ? <span className="auto-bar" style={{ animationDuration: `${autoMs}ms` }} /> : null}
        {nextLabel || "下一隻"}
      </button>
    </section>
  );
}
