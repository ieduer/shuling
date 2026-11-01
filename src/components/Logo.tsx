import { art } from "../engine/art";

/** 書靈 標誌：畫出來的圓形漆金徽章（狐龍護珠、燭火）。 */
export function Logo({ size = 44, className = "" }: { size?: number; className?: string }) {
  return <img className={`logo ${className}`} src={art.logo} width={size} height={size} alt="" aria-hidden="true" decoding="async" />;
}
