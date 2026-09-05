import { useEffect, useState } from "react";

/**
 * Seconds elapsed since `startedAt` (ISO string or epoch ms), ticking once a
 * second while `running` is true. Returns 0 when there is no start time.
 * Freezes at the last value when `running` turns false so a finished run shows
 * its total, not a still-climbing clock.
 */
export function useElapsed(startedAt?: string | number | null, running = true): number {
  const start = startedAt == null ? null : typeof startedAt === "number" ? startedAt : Date.parse(startedAt);
  const compute = () => (start == null || Number.isNaN(start) ? 0 : Math.max(0, Math.floor((Date.now() - start) / 1000)));
  const [seconds, setSeconds] = useState<number>(compute);

  useEffect(() => {
    setSeconds(compute());
    if (!running || start == null) return;
    const id = window.setInterval(() => setSeconds(compute()), 1000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [start, running]);

  return seconds;
}
