import { Component, type ErrorInfo, type ReactNode } from "react";

interface State {
  error: Error | null;
}

/** 畫面錯誤邊界：某一頁的渲染拋錯時只換掉這一頁，不讓整個 React 樹卸載成一片純色；本機存檔與學力都不動。 */
export class ErrorBoundary extends Component<{ children: ReactNode; onHome?: () => void }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("[ziling] screen crashed", error, info.componentStack);
  }

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;
    const detail = String(error && (error.stack || error.message || error)).slice(0, 600);
    return (
      <section className="panel crash" role="alert">
        <h2>這一頁出了點狀況</h2>
        <p>你的進度、學力與收服記錄都還在本機存檔裡，沒有丟失。可以重新載入，或先回對陣頁。</p>
        <div className="row-form">
          <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>
            重新載入
          </button>
          {this.props.onHome && (
            <button
              type="button"
              className="btn"
              onClick={() => {
                this.setState({ error: null });
                this.props.onHome?.();
              }}
            >
              回對陣
            </button>
          )}
        </div>
        <details className="crash-detail">
          <summary>錯誤訊息（回報時請附上）</summary>
          <pre>{detail}</pre>
        </details>
      </section>
    );
  }
}
