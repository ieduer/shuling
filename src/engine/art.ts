/** 真圖素材登記：所有圖標、書靈獸、徽章、地圖與背景都是畫出來的點陣圖（public/assets/art/v1，提示詞與種子在 art-pack/），不用線條圖示。
 * 風格與字靈收服一致（寫實上光、金屬框、異世界地圖），配色與題材不同：青瓷、月光石、靛藍與銀；書卷化成的靈獸。 */
import type { Tier } from "./types";
import { hashString } from "./rng";

export const ART = "/assets/art/v1";

export const art = {
  logo: `${ART}/logo.webp`,
  dial: `${ART}/dial.webp`,
  cardback: `${ART}/cardback.webp`,
  candle: `${ART}/candle.webp`,
  mana: `${ART}/mana.webp`,
  star: `${ART}/star.webp`,
  crown: `${ART}/crown.webp`,
  nav: {
    home: `${ART}/nav-home.webp`,
    journey: `${ART}/nav-journey.webp`,
    board: `${ART}/nav-board.webp`,
    codex: `${ART}/nav-codex.webp`,
    me: `${ART}/nav-me.webp`,
  },
  rank: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((i) => `${ART}/rank-${i}.webp`),
  gem: { N: `${ART}/gem-N.webp`, R: `${ART}/gem-R.webp`, SR: `${ART}/gem-SR.webp`, SSR: `${ART}/gem-SSR.webp` } as Record<Tier, string>,
  mode: { daily: `${ART}/mode-daily.webp`, free: `${ART}/mode-free.webp`, wrong: `${ART}/mode-wrong.webp` },
  bg: {
    home: `${ART}/bg-home.webp`,
    board: `${ART}/bg-board.webp`,
    codex: `${ART}/bg-codex.webp`,
    me: `${ART}/bg-me.webp`,
    battle: `${ART}/bg-battle.webp`,
    result: `${ART}/bg-result.webp`,
  },
  node: { off: `${ART}/node-off.webp`, lit: `${ART}/node-lit.webp`, clear: `${ART}/node-clear.webp` },
  skill: { zhuzhao: `${ART}/skill-zhuzhao.webp`, zhishui: `${ART}/skill-zhishui.webp`, shenji: `${ART}/skill-shenji.webp` },
};

export interface Beast {
  id: string;
  name: string;
  tier: Tier;
  src: string;
}

/** 書靈獸：每個稀有度四種形態，依書靈 id 固定分配（同一隻書靈永遠是同一獸）。 */
export const BEASTS: Record<Tier, Beast[]> = {
  N: [
    { id: "n-silverfish", name: "蠹魚", tier: "N", src: `${ART}/beast-n-silverfish.webp` },
    { id: "n-slipcrane", name: "簡鶴", tier: "N", src: `${ART}/beast-n-slipcrane.webp` },
    { id: "n-inkfrog", name: "硯蛙", tier: "N", src: `${ART}/beast-n-inkfrog.webp` },
    { id: "n-kite", name: "紙鳶", tier: "N", src: `${ART}/beast-n-kite.webp` },
  ],
  R: [
    { id: "r-scrollfox", name: "卷狐", tier: "R", src: `${ART}/beast-r-scrollfox.webp` },
    { id: "r-brushqilin", name: "筆麟", tier: "R", src: `${ART}/beast-r-brushqilin.webp` },
    { id: "r-seallion", name: "印獅", tier: "R", src: `${ART}/beast-r-seallion.webp` },
    { id: "r-sutraelephant", name: "經象", tier: "R", src: `${ART}/beast-r-sutraelephant.webp` },
  ],
  SR: [
    { id: "sr-starwhale", name: "星鯨", tier: "SR", src: `${ART}/beast-sr-starwhale.webp` },
    { id: "sr-falcon", name: "文鷂", tier: "SR", src: `${ART}/beast-sr-falcon.webp` },
    { id: "sr-bookdeer", name: "典鹿", tier: "SR", src: `${ART}/beast-sr-bookdeer.webp` },
    { id: "sr-lynx", name: "帛猞", tier: "SR", src: `${ART}/beast-sr-lynx.webp` },
  ],
  SSR: [
    { id: "ssr-tianlu", name: "天祿", tier: "SSR", src: `${ART}/beast-ssr-tianlu.webp` },
    { id: "ssr-kunpeng", name: "鯤鵬", tier: "SSR", src: `${ART}/beast-ssr-kunpeng.webp` },
    { id: "ssr-scrolldragon", name: "卷龍", tier: "SSR", src: `${ART}/beast-ssr-scrolldragon.webp` },
    { id: "ssr-whitedeer", name: "白鹿", tier: "SSR", src: `${ART}/beast-ssr-whitedeer.webp` },
  ],
};

export function beastById(id: string): Beast | undefined {
  for (const list of Object.values(BEASTS)) for (const b of list) if (b.id === id) return b;
  return undefined;
}

export function beastFor(card: { id: string; tier: Tier }): Beast {
  const list = BEASTS[card.tier] || BEASTS.N;
  return list[hashString(`beast|${card.id}`) % list.length];
}

export interface Region {
  /** 域的識別鍵（圖鑑分區、地圖 key） */
  id: string;
  /** 這個域涵蓋的冊別（一域可含多冊，例如貢院含北京卷與指考） */
  books: string[];
  /** 附加域（2026-10-31 杏壇書院、龍門貢院）：關卡計入通關數，不計入段位的「全通域」 */
  bonus?: boolean;
  /** 異世界地名 */
  name: string;
  /** 對應的冊別（副題） */
  sub: string;
  map: string;
  guardian: string;
  accent: string;
}

/** 書靈旅程十四域（核心經典版，2026-11-02）：中文四域（詩、文、說部、新潮）、萬國九個海區與真卷殿，連成一張地圖。 */
export const REGIONS: Region[] = [
  { id: "shi", books: ["shi"], name: "雲山詩國", sub: "名篇名句、詩人與流派", map: `${ART}/map-shi.webp`, guardian: "sr-falcon", accent: "#7fb7a4" },
  { id: "wen", books: ["wen"], name: "文淵", sub: "經典、諸子、史傳與古文", map: `${ART}/map-wen.webp`, guardian: "r-sutraelephant", accent: "#a7b98a" },
  { id: "shuo", books: ["shuo"], name: "說部梨園", sub: "古典小說與戲曲", map: `${ART}/map-shuo.webp`, guardian: "r-brushqilin", accent: "#d98c6a" },
  { id: "xin", books: ["xin"], name: "新潮碼頭", sub: "現當代中文文學", map: `${ART}/map-xin.webp`, guardian: "n-slipcrane", accent: "#7fa7c9" },
  { id: "aegean", books: ["aegean"], name: "愛琴海", sub: "古希臘", map: `${ART}/map-aegean.webp`, guardian: "r-scrollfox", accent: "#6fa8dc" },
  { id: "rome", books: ["rome"], name: "七丘", sub: "古羅馬", map: `${ART}/map-rome.webp`, guardian: "r-seallion", accent: "#c9a76a" },
  { id: "east", books: ["east"], name: "新月與恆河", sub: "兩河、希伯來、印度、波斯、阿拉伯", map: `${ART}/map-east.webp`, guardian: "sr-lynx", accent: "#d6a54f" },
  { id: "europe", books: ["europe"], name: "聖殿長廊", sub: "中世紀到十八世紀歐洲", map: `${ART}/map-europe.webp`, guardian: "ssr-scrolldragon", accent: "#a08ad6" },
  { id: "c19", books: ["c19"], name: "浪漫與寫實", sub: "十九世紀", map: `${ART}/map-c19.webp`, guardian: "ssr-whitedeer", accent: "#c98f8f" },
  { id: "modern", books: ["modern"], name: "現代迷城", sub: "二十世紀至今", map: `${ART}/map-modern.webp`, guardian: "n-inkfrog", accent: "#8fbfb8" },
  { id: "fusang", books: ["fusang"], name: "扶桑", sub: "日本", map: `${ART}/map-fusang.webp`, guardian: "sr-bookdeer", accent: "#e08aa0" },
  { id: "nobel", books: ["nobel"], name: "諾貝爾星河", sub: "1901–2026 全部得主", map: `${ART}/map-nobel.webp`, guardian: "ssr-kunpeng", accent: "#8fb8e6" },
  { id: "schools", books: ["schools"], name: "思潮館", sub: "思潮、文論與文體", map: `${ART}/map-schools.webp`, guardian: "sr-starwhale", accent: "#b48ef1" },
  { id: "exam", books: ["exam"], name: "真卷殿", sub: "北京卷與指考真題", map: `${ART}/map-exam.webp`, guardian: "ssr-tianlu", accent: "#e0b45f" },
];

export function regionOf(book: string): Region | undefined {
  return REGIONS.find((r) => r.books.includes(book));
}

/** 預載一批圖（切頁前先暖快取，避免背景閃白）。 */
export function warm(srcs: string[]): void {
  if (typeof Image === "undefined") return;
  for (const s of srcs) {
    const im = new Image();
    im.decoding = "async";
    im.src = s;
  }
}
