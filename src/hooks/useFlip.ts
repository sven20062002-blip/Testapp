import { useLayoutEffect, useRef, type MutableRefObject, type RefObject } from 'react';

const reduced = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
export const EASE_OUT = 'cubic-bezier(.2,.9,.25,1)';

/**
 * FLIP animation for children marked with `data-flip="<key>"`: when they move or change size,
 * they glide from their old to their new position instead of jumping. New children fade/scale in
 * (staggered on first mount). `skip` suppresses one pass (e.g. after drag & drop, which animates itself).
 */
export function useFlip(container: RefObject<HTMLElement>, deps: unknown[], skip?: MutableRefObject<boolean>) {
  const prev = useRef<Map<string, { x: number; y: number; w: number; h: number }> | null>(null);
  useLayoutEffect(() => {
    const root = container.current;
    if (!root) return;
    const items = Array.from(root.querySelectorAll<HTMLElement>('[data-flip]'));
    const next = new Map<string, { x: number; y: number; w: number; h: number }>();
    for (const it of items) {
      const r = it.getBoundingClientRect();
      next.set(it.dataset.flip!, { x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height });
    }
    const first = prev.current === null;
    if (!reduced() && !skip?.current && typeof items[0]?.animate === 'function') {
      items.forEach((it, i) => {
        const b = next.get(it.dataset.flip!)!;
        const a = prev.current?.get(it.dataset.flip!);
        if (!a) {
          it.animate([{ opacity: 0, transform: 'translateY(10px) scale(.97)' }, { opacity: 1, transform: 'none' }], {
            duration: 420,
            delay: first ? Math.min(i, 8) * 45 : 0,
            easing: EASE_OUT,
            fill: 'backwards',
          });
          return;
        }
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const sx = b.w ? a.w / b.w : 1;
        const sy = b.h ? a.h / b.h : 1;
        if (Math.abs(dx) < 1 && Math.abs(dy) < 1 && Math.abs(sx - 1) < 0.01 && Math.abs(sy - 1) < 0.01) return;
        it.animate(
          [
            { transformOrigin: 'top left', transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})` },
            { transformOrigin: 'top left', transform: 'none' },
          ],
          { duration: 420, easing: EASE_OUT },
        );
      });
    }
    if (skip) skip.current = false;
    prev.current = next;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
