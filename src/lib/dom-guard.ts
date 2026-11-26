/** 瀏覽器整頁翻譯防護（2026-11-26 用戶反饋：題目數字跑到句尾、作答後「這一頁出了點狀況」、退出重進也一樣）。
 * Chrome／Edge 等把頁面從正體譯成简体時，會把文字節點換成 <font> 包起來的新節點；React 之後要移除或插在原節點前面時，
 * 原節點已不在父節點下，原生 removeChild／insertBefore 拋 NotFoundError，整個畫面掉進錯誤邊界。
 * 這裡只在「節點已被搬走」時改走安全路徑（移除就略過、插入就接在最後），其他情況一律照原生行為；
 * 題面、選項、靈名的容器另按題目 key 重新掛載，翻譯的舊字不會殘留。 */
type GuardedProto = Node & { __bdfzTranslateGuard?: boolean };

let noted = false;
function note(op: string): void {
  if (noted) return;
  noted = true;
  console.warn(`[dom-guard] ${op}: 節點已被頁面翻譯搬動，改走安全路徑`);
}

export function installTranslateGuard(target: { prototype: Node } | undefined = typeof Node === "function" ? Node : undefined): boolean {
  const proto = target?.prototype as GuardedProto | undefined;
  if (!proto || proto.__bdfzTranslateGuard) return false;
  const nativeRemove = proto.removeChild;
  const nativeInsert = proto.insertBefore;
  proto.removeChild = function (this: Node, child: Node) {
    if (child && child.parentNode !== this) {
      note("removeChild");
      return child;
    }
    return nativeRemove.call(this, child);
  } as typeof proto.removeChild;
  proto.insertBefore = function (this: Node, node: Node, ref: Node | null) {
    if (ref && ref.parentNode !== this) {
      note("insertBefore");
      return nativeInsert.call(this, node, null);
    }
    return nativeInsert.call(this, node, ref);
  } as typeof proto.insertBefore;
  Object.defineProperty(proto, "__bdfzTranslateGuard", { value: true });
  return true;
}
