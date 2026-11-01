import { useState } from "react";
import { art } from "../engine/art";
import { cycleTheme, themeMeta, useTheme } from "../engine/theme";
import { sfx } from "../engine/sfx";

/** 色系轉盤：點一下換下一套（宣紙→青瓷→墨夜→玄青），轉盤轉四分之一圈，不開選單、不用文字按鈕。 */
export function ThemeDial({ size = 44 }: { size?: number }) {
  const cur = useTheme();
  const [spin, setSpin] = useState(0);
  const meta = themeMeta(cur);
  return (
    <button
      type="button"
      className="dial"
      aria-label={`色系：${meta.name}，點一下換下一套`}
      title={meta.name}
      onClick={() => {
        cycleTheme();
        setSpin((n) => n + 1);
        sfx.flip();
      }}
      style={{ width: size, height: size }}
    >
      <img src={art.dial} alt="" width={size} height={size} decoding="async" style={{ transform: `rotate(${spin * 90}deg)` }} />
      <span className="dial-name" aria-hidden="true" key={cur}>
        {meta.name}
      </span>
    </button>
  );
}
