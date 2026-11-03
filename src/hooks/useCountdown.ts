import { useEffect, useRef, useState } from 'react';

export function useCountdown(seconds: number, onExpire: () => void): number {
  const [left, setLeft] = useState(seconds);
  const cb = useRef(onExpire);
  cb.current = onExpire;

  useEffect(() => {
    const start = Date.now();
    const id = setInterval(() => {
      const l = Math.max(0, seconds - (Date.now() - start) / 1000);
      setLeft(l);
      if (l <= 0) {
        clearInterval(id);
        cb.current();
      }
    }, 100);
    return () => clearInterval(id);
  }, [seconds]);

  return left;
}