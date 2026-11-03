import { forwardRef } from 'react';

// Плеер невидим, но находится на экране (на телефонах плеер за экраном иногда не воспроизводит звук)
const HiddenPlayer = forwardRef<HTMLIFrameElement>((_, ref) => (
  <iframe
    ref={ref}
    title='soundcloud'
    allow='autoplay'
    src='https://w.soundcloud.com/player/?url=https%3A//soundcloud.com/'
    style={{
      position: 'fixed',
      right: 0,
      bottom: 0,
      width: 300,
      height: 166,
      border: 0,
      opacity: 0,
      pointerEvents: 'none',
      zIndex: -1,
    }}
  />
));

export default HiddenPlayer;
