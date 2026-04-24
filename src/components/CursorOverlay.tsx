import { useEffect } from 'react';

const INTERACTIVE_SELECTOR = 'a, button, [role="button"], input, textarea, select, summary, label';

export default function CursorOverlay() {
  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const isFinePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (!isFinePointer) {
      return;
    }

    document.documentElement.classList.add('cursor-enabled');

    const dot = document.getElementById('cursor-dot');
    const ring = document.getElementById('cursor-ring');

    if (!dot || !ring) {
      return;
    }

    let mx = window.innerWidth / 2;
    let my = window.innerHeight / 2;
    let rx = mx;
    let ry = my;
    let frame = 0;

    const handleMove = (event: MouseEvent) => {
      mx = event.clientX;
      my = event.clientY;
      dot.style.left = `${mx}px`;
      dot.style.top = `${my}px`;
    };

    const setHoverState = (isActive: boolean) => {
      ring.style.width = isActive ? '56px' : '36px';
      ring.style.height = isActive ? '56px' : '36px';
      ring.style.borderColor = isActive ? 'rgba(191, 164, 106, 0.9)' : 'rgba(191, 164, 106, 0.6)';
      dot.style.background = isActive ? '#F0EDE8' : 'var(--accent-gold)';
    };

    const handleOver = (event: MouseEvent) => {
      if ((event.target as HTMLElement | null)?.closest(INTERACTIVE_SELECTOR)) {
        setHoverState(true);
      }
    };

    const handleOut = (event: MouseEvent) => {
      if ((event.target as HTMLElement | null)?.closest(INTERACTIVE_SELECTOR)) {
        setHoverState(false);
      }
    };

    const animate = () => {
      if (prefersReducedMotion) {
        rx = mx;
        ry = my;
      } else {
        rx += (mx - rx) * 0.12;
        ry += (my - ry) * 0.12;
      }

      ring.style.left = `${rx}px`;
      ring.style.top = `${ry}px`;
      frame = window.requestAnimationFrame(animate);
    };

    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseover', handleOver);
    document.addEventListener('mouseout', handleOut);
    frame = window.requestAnimationFrame(animate);

    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseover', handleOver);
      document.removeEventListener('mouseout', handleOut);
      document.documentElement.classList.remove('cursor-enabled');
    };
  }, []);

  return (
    <>
      <div id="cursor-ring" aria-hidden="true" />
      <div id="cursor-dot" aria-hidden="true" />
    </>
  );
}
