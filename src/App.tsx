import { useCallback, useEffect, useState } from "react";
import { Backdrop, type Scene } from "./components/Backdrop";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { Nav, type Tab } from "./components/Nav";
import { SyncPrompt } from "./components/SyncPrompt";
import { Toasts, toast } from "./components/Toast";
import { Home } from "./screens/Home";
import { Journey } from "./screens/Journey";
import { Battle } from "./screens/Battle";
import { Result } from "./screens/Result";
import { Board } from "./screens/Board";
import { Codex } from "./screens/Codex";
import { Me } from "./screens/Me";
import type { RunMode, RunSummary } from "./engine/types";
import { finishRun, getProgress, rankStatsOf, useProgress } from "./engine/progress";
import { allQuestionIds, bank } from "./engine/bank";
import type { SubmitResult } from "./engine/api";
import { flushOutbox, startOutbox, submitWithOutbox } from "./engine/outbox";
import { syncRunToUserCenter } from "./lib/sync";
import { markDirty, startSync } from "./lib/cloud";
import { rankOf, type RankStats } from "./engine/score";
import { sfx } from "./engine/sfx";
import { confetti } from "./engine/fx";

export interface RunRequest {
  mode: RunMode;
  scope: string; // book id | 'all' | 'cn' | 'tw' | 'exam' | lesson id (mode=lesson)
  label: string;
  seed: string;
}

interface ResultState {
  summary: RunSummary;
  xpBefore: number;
  xpAfter: number;
  gain: number;
  multiplier: number;
  repeat: number;
  statsAfter: RankStats;
  server: Promise<SubmitResult | null>;
  rankUp: boolean;
  /** 學力（對局入帳＋成就加成）這局前後；差額減去 gain 就是這局帶來的成就加成（v2.10） */
  prestigeBefore: number;
  prestigeAfter: number;
}

export default function App() {
  const progress = useProgress();
  const [tab, setTab] = useState<Tab>("home");
  const [run, setRun] = useState<RunRequest | null>(null);
  const [result, setResult] = useState<ResultState | null>(null);
  const scene: Scene = run ? "battle" : result ? "result" : tab;

  useEffect(() => {
    document.documentElement.dataset.screen = scene;
    if (!run && !result) window.scrollTo({ top: 0 });
  }, [run, result, scene]);

  useEffect(() => {
    // 登入用戶中心的裝置：開站時與雲端存檔對齊（取大合併），之後每局推回
    startSync();
    // 上次沒送到的戰報補送（伺服器去重，不會多算）
    startOutbox();
  }, []);

  const startRun = useCallback((req: RunRequest) => {
    sfx.tap();
    setResult(null);
    setRun(req);
  }, []);

  const onFinish = useCallback((summary: RunSummary) => {
    const before = rankOf(rankStatsOf(getProgress(), bank.lessons, allQuestionIds()));
    const fin = finishRun(summary);
    const { xpBefore, xpAfter } = fin;
    const statsAfter = rankStatsOf(getProgress(), bank.lessons, allQuestionIds());
    const after = rankOf(statsAfter);
    const rankUp = after.idx > before.idx;
    const p = getProgress();
    const server = submitWithOutbox({
      mode: summary.mode,
      seed: summary.seed,
      scope: summary.scope,
      nick: p.nick,
      answers: summary.answers.map((a) => ({ q: a.q, pick: a.pick, ms: a.ms })),
      startedAt: summary.startedAt,
    });
    void server.then((r) => r && flushOutbox()); // 這局送到了，順手補送之前沒送到的
    void syncRunToUserCenter(summary, statsAfter);
    markDirty();
    if (rankUp) {
      window.setTimeout(() => {
        confetti();
        sfx.rankUp();
      }, 600);
    }
    setRun(null);
    setResult({ summary, xpBefore, xpAfter, gain: fin.gain, multiplier: fin.multiplier, repeat: fin.repeat, statsAfter, server, rankUp, prestigeBefore: before.prestige, prestigeAfter: after.prestige });
  }, []);

  const quitRun = useCallback(() => {
    setRun(null);
    toast("已退出，本局不計分");
  }, []);

  const showNav = !run && !result;

  return (
    <div className="app">
      <Backdrop scene={scene} />
      <main className="screen" key={scene}>
        <ErrorBoundary
          onHome={() => {
            setRun(null);
            setResult(null);
            setTab("home");
          }}
        >
          {run ? (
            <Battle request={run} onFinish={onFinish} onQuit={quitRun} />
          ) : result ? (
            <Result
              state={result}
              onAgain={() => startRun({ ...result.summary, mode: result.summary.mode, scope: result.summary.scope, label: "再戰", seed: `${Date.now()}` })}
              onWrong={() => startRun({ mode: "wrong", scope: "wrong", label: "復仇", seed: `${Date.now()}` })}
              onHome={() => {
                setResult(null);
                setTab("home");
              }}
              onBoard={() => {
                setResult(null);
                setTab("board");
              }}
            />
          ) : tab === "home" ? (
            <Home onStart={startRun} onNav={setTab} progress={progress} />
          ) : tab === "journey" ? (
            <Journey onStart={startRun} progress={progress} />
          ) : tab === "board" ? (
            <Board />
          ) : tab === "codex" ? (
            <Codex />
          ) : (
            <Me />
          )}
        </ErrorBoundary>
      </main>
      {showNav && <Nav tab={tab} onChange={setTab} />}
      <SyncPrompt />
      <Toasts />
    </div>
  );
}
