import type { CSSProperties, RefObject } from 'react';

const SRC = 'https://w.soundcloud.com/player/?url=https%3A//soundcloud.com/';

// Плееры невидимы, но находятся на экране (на телефонах плеер за экраном иногда не воспроизводит звук)
const STYLE: CSSProperties = {
  position: 'fixed',
  right: 0,
  bottom: 0,
  width: 300,
  height: 166,
  border: 0,
  opacity: 0,
  pointerEvents: 'none',
  zIndex: -1,
};

export default function HiddenPlayer({
  refA,
  refB,
}: {
  refA: RefObject<HTMLIFrameElement>;
  refB: RefObject<HTMLIFrameElement>;
}) {
  return (
    <>
      <iframe ref={refA} title='soundcloud-a' allow='autoplay' src={SRC} style={STYLE} />
      <iframe ref={refB} title='soundcloud-b' allow='autoplay' src={SRC} style={STYLE} />
    </>
  );
}
