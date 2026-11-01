/** 畫面特效：全螢幕 canvas 粒子（金屑、墨點、紙屑）＋ 震動／閃光的 DOM class。單例，手機也不卡。 */

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: string;
  shape: "dot" | "spark" | "paper";
  spin: number;
  rot: number;
}

let canvas: HTMLCanvasElement | null = null;
let ctx2d: CanvasRenderingContext2D | null = null;
let particles: Particle[] = [];
let raf = 0;
let last = 0;

function ensure(): CanvasRenderingContext2D | null {
  if (typeof document === "undefined") return null;
  if (!canvas) {
    canvas = document.createElement("canvas");
    canvas.className = "fx-canvas";
    canvas.setAttribute("aria-hidden", "true");
    document.body.appendChild(canvas);
    ctx2d = canvas.getContext("2d");
    const resize = () => {
      if (!canvas) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.floor(window.innerWidth * dpr);
      canvas.height = Math.floor(window.innerHeight * dpr);
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      ctx2d?.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);
  }
  return ctx2d;
}

function loop(t: number): void {
  const c = ensure();
  if (!c || !canvas) return;
  const dt = Math.min(0.05, (t - last) / 1000 || 0.016);
  last = t;
  c.clearRect(0, 0, window.innerWidth, window.innerHeight);
  particles = particles.filter((p) => p.life < p.max);
  for (const p of particles) {
    p.life += dt;
    p.vy += (p.shape === "paper" ? 180 : 420) * dt;
    p.vx *= 0.985;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.rot += p.spin * dt;
    const a = 1 - p.life / p.max;
    c.globalAlpha = Math.max(0, a);
    c.fillStyle = p.color;
    if (p.shape === "dot") {
      c.beginPath();
      c.arc(p.x, p.y, p.size * (0.6 + a * 0.4), 0, Math.PI * 2);
      c.fill();
    } else if (p.shape === "spark") {
      c.save();
      c.translate(p.x, p.y);
      c.rotate(p.rot);
      c.fillRect(-p.size * 2, -p.size * 0.35, p.size * 4, p.size * 0.7);
      c.restore();
    } else {
      c.save();
      c.translate(p.x, p.y);
      c.rotate(p.rot);
      c.fillRect(-p.size, -p.size * 0.6, p.size * 2, p.size * 1.2);
      c.restore();
    }
  }
  c.globalAlpha = 1;
  if (particles.length) raf = requestAnimationFrame(loop);
  else {
    raf = 0;
    c.clearRect(0, 0, window.innerWidth, window.innerHeight);
  }
}

function start(): void {
  if (!raf) {
    last = performance.now();
    raf = requestAnimationFrame(loop);
  }
}

const GOLD = ["#f6da93", "#e6c36b", "#fff2c6", "#d9a441"];
const INK = ["#1b1714", "#3a2f27", "#6b5a4a"];
const JADE = ["#9fe3c2", "#4fb08a", "#d6fff0"];
const RED = ["#ff8a6b", "#d9432b", "#ffd0c4"];

export function burst(x: number, y: number, kind: "gold" | "ink" | "jade" | "red" = "gold", count = 28): void {
  if (!ensure()) return;
  const palette = kind === "gold" ? GOLD : kind === "ink" ? INK : kind === "jade" ? JADE : RED;
  for (let i = 0; i < count; i++) {
    const ang = Math.random() * Math.PI * 2;
    const sp = 120 + Math.random() * 320;
    particles.push({
      x,
      y,
      vx: Math.cos(ang) * sp,
      vy: Math.sin(ang) * sp - 120,
      life: 0,
      max: 0.6 + Math.random() * 0.7,
      size: 2 + Math.random() * 3,
      color: palette[Math.floor(Math.random() * palette.length)],
      shape: Math.random() < 0.5 ? "dot" : "spark",
      spin: (Math.random() - 0.5) * 12,
      rot: Math.random() * Math.PI,
    });
  }
  start();
}

/** 升段／通關的滿屏紙屑。 */
export function confetti(count = 140): void {
  if (!ensure()) return;
  const w = window.innerWidth;
  for (let i = 0; i < count; i++) {
    const palette = Math.random() < 0.6 ? GOLD : Math.random() < 0.5 ? RED : JADE;
    particles.push({
      x: Math.random() * w,
      y: -20 - Math.random() * 120,
      vx: (Math.random() - 0.5) * 120,
      vy: 60 + Math.random() * 160,
      life: 0,
      max: 2.2 + Math.random() * 1.6,
      size: 4 + Math.random() * 4,
      color: palette[Math.floor(Math.random() * palette.length)],
      shape: "paper",
      spin: (Math.random() - 0.5) * 8,
      rot: Math.random() * Math.PI,
    });
  }
  start();
}

export function shake(intensity: "soft" | "hard" = "soft"): void {
  const el = document.getElementById("root");
  if (!el) return;
  el.classList.remove("shake-soft", "shake-hard");
  void el.offsetWidth;
  el.classList.add(intensity === "hard" ? "shake-hard" : "shake-soft");
  window.setTimeout(() => el.classList.remove("shake-soft", "shake-hard"), 450);
}

export function flash(kind: "good" | "bad"): void {
  const el = document.createElement("div");
  el.className = `fx-flash fx-flash-${kind}`;
  document.body.appendChild(el);
  window.setTimeout(() => el.remove(), 380);
}

export function centerOf(el: Element | null): { x: number; y: number } {
  if (!el) return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}
