import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { initBank } from "./engine/bank";
import { applyTheme, getTheme } from "./engine/theme";
import "./styles/index.css";
import "./styles/game.css";
import "./styles/screens.css";

applyTheme(getTheme());
const root = createRoot(document.getElementById("root")!);
initBank()
  .then(() => {
    root.render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
  })
  .catch((err: unknown) => {
    root.render(
      <div className="boot-error">
        <p>題庫載入失敗，請重新整理。</p>
        <p className="muted">{String((err as Error)?.message || err)}</p>
      </div>,
    );
  });
