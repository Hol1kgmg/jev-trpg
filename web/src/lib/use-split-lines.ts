import { useEffect, useRef } from 'react';
import { splitText, type TextSplit } from 'kugiri';

// 文章をブラウザの改行位置で行に分け、下から順に立ち上げる。
// 幅が固定される場面（モーダル内）だけで使う。kugiri は 1 回のレイアウトのスナップショットで、リサイズには追従しない
export function useSplitLines<T extends HTMLElement>(delay: number) {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    // 子の effect は親の showModal() より先に走るため、dialog が表示されて描画されるまで 1 フレーム待つ
    let split: TextSplit | undefined;
    const raf = requestAnimationFrame(() => {
      split = splitText(el, { type: ['lines'], mask: 'lines' });
      split.lines.forEach((line, i) =>
        line.animate([{ transform: 'translateY(100%)', opacity: 0 }, { transform: 'none', opacity: 1 }], {
          duration: 900,
          delay: delay + i * 120,
          easing: 'cubic-bezier(0.23, 1, 0.32, 1)',
          fill: 'backwards',
        }),
      );
    });
    return () => {
      cancelAnimationFrame(raf);
      split?.revert();
    };
  }, [delay]);
  return ref;
}
