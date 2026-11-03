import { forwardRef } from 'react';

// Плеер скрыт за пределами экрана, чтобы не показывать название трека
const HiddenPlayer = forwardRef<HTMLIFrameElement>((_, ref) => (
  <iframe
    ref={ref}
    title="soundcloud"
    allow="autoplay"
    src="https://w.soundcloud.com/player/?url=https%3A//soundcloud.com/"
    style={{ position: 'fixed', left: -9999, top: 0, width: 300, height: 166, border: 0 }}
  />
));

export default HiddenPlayer;