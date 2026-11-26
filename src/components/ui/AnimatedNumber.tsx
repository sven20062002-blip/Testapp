import { useEffect, useRef, useState } from 'react';
import { fmtNumber } from '@/lib/units';

const reduced = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const ease = (t: number) => 1 - Math.pow(1 - t, 3);

/**
 * Number that counts up (or down) to its new value instead of jumping.
 * Starts from 0 on first render, later animates from the previous value. Respects reduced motion.
 */
export function AnimatedNumber({ value, digits = 0, duration = 700, format }: { value: number; digits?: number; duration?: number; format?: (v: number) => string }) {
  const [shown, setShown] = useState(() => (reduced() ? value : 0));
  const from = useRef(shown);
  const raf = useRef(0);

  useEffect(() => {
    if (!Number.isFinite(value)) return;
    if (reduced()) {
      setShown(value);
      from.current = value;
      return;
    }
    const start = performance.now();
    const a = from.current;
    cancelAnimationFrame(raf.current);
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const v = a + (value - a) * ease(t);
      setShown(v);
      from.current = v;
      if (t < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [value, duration]);

  const rounded = Math.round(shown * 10 ** digits) / 10 ** digits;
  return <>{format ? format(rounded) : fmtNumber(rounded, digits)}</>;
}
