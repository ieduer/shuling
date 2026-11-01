/** WebAudio 小合成器：無音檔。預設靜音，使用者在設定裡打開（屬使用者手勢，AudioContext 可啟動）。 */
import { getProgress } from "./progress";

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (!getProgress().sound || typeof window === "undefined") return null;
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    try {
      ctx = new Ctor();
    } catch {
      return null;
    }
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

interface Tone {
  freq: number;
  dur: number;
  type?: OscillatorType;
  gain?: number;
  slideTo?: number;
  delay?: number;
}

function play(tones: Tone[]): void {
  const c = audio();
  if (!c) return;
  const now = c.currentTime;
  for (const t of tones) {
    const start = now + (t.delay ?? 0);
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = t.type ?? "sine";
    osc.frequency.setValueAtTime(t.freq, start);
    if (t.slideTo) osc.frequency.exponentialRampToValueAtTime(t.slideTo, start + t.dur);
    const peak = t.gain ?? 0.14;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(peak, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + t.dur);
    osc.connect(gain);
    gain.connect(c.destination);
    osc.start(start);
    osc.stop(start + t.dur + 0.03);
  }
}

export const sfx = {
  tap: () => play([{ freq: 520, dur: 0.05, type: "triangle", gain: 0.06 }]),
  flip: () => play([{ freq: 220, dur: 0.12, type: "sine", slideTo: 440, gain: 0.08 }]),
  correct: (combo: number) => {
    const base = 523 + Math.min(combo, 8) * 40;
    play([
      { freq: base, dur: 0.1, type: "triangle" },
      { freq: base * 1.25, dur: 0.12, type: "triangle", delay: 0.07 },
      { freq: base * 1.5, dur: 0.18, type: "triangle", delay: 0.14 },
    ]);
  },
  wrong: () => play([{ freq: 180, dur: 0.22, type: "sawtooth", slideTo: 120, gain: 0.1 }]),
  tick: () => play([{ freq: 900, dur: 0.03, type: "square", gain: 0.04 }]),
  combo: () => play([{ freq: 880, dur: 0.08, type: "square", gain: 0.06 }, { freq: 1320, dur: 0.12, type: "square", gain: 0.06, delay: 0.06 }]),
  rankUp: () =>
    play([
      { freq: 392, dur: 0.18, type: "triangle" },
      { freq: 523, dur: 0.18, type: "triangle", delay: 0.16 },
      { freq: 659, dur: 0.18, type: "triangle", delay: 0.32 },
      { freq: 784, dur: 0.5, type: "triangle", delay: 0.48, gain: 0.18 },
    ]),
  reveal: () => play([{ freq: 660, dur: 0.08, type: "sine", gain: 0.07 }, { freq: 990, dur: 0.16, type: "sine", gain: 0.07, delay: 0.08 }]),
};
