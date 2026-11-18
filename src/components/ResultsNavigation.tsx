import { useEffect, useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import '../styles/resultsNavigation.css';

export default function ResultsNavigation() {
  const [visible, setVisible] = useState(false);

  useLayoutEffect(() => {
    // Reset before paint, even if the page normally uses smooth scrolling.
    const root = document.documentElement;
    const previous = root.style.scrollBehavior;
    root.style.scrollBehavior = 'auto';
    window.scrollTo(0, 0);
    if (document.scrollingElement) document.scrollingElement.scrollTop = 0;
    root.style.scrollBehavior = previous;
  }, []);

  useEffect(() => {
    const update = () => setVisible(window.scrollY > 320);
    update();
    window.addEventListener('scroll', update, { passive: true });
    return () => window.removeEventListener('scroll', update);
  }, []);

  const goUp = () => {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reducedMotion) {
      const root = document.documentElement;
      const previous = root.style.scrollBehavior;
      root.style.scrollBehavior = 'auto';
      window.scrollTo(0, 0);
      root.style.scrollBehavior = previous;
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  if (!visible) return null;
  return createPortal(
    <button className='results-back-to-top' type='button' aria-label='Прокрутить итоги наверх' title='Наверх' onClick={goUp}>
      <svg width='20' height='20' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round' aria-hidden='true'>
        <path d='M12 19V5M5 12l7-7 7 7'/>
      </svg>
    </button>,
    document.body,
  );
}
