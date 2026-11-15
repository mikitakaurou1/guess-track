import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import Icon from './Icon';
import { readyClip } from '../utils/clipCache';
import '../styles/clip.css';

interface Props {
  src: string; // адрес видеофайла на сервере
  sound?: boolean; // пробуем со звуком; если браузер не разрешил, играем без звука
  onState?: (on: boolean) => void; // true, когда клип играет и карточка показана внутри клипа
  children: ReactNode;
}

export default function ClipBackdrop({ src, sound, onState, children }: Props) {
  const video = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [off, setOff] = useState(false);
  const url = useMemo(() => readyClip(src) ?? src, [src]);
  const stateRef = useRef(onState);
  stateRef.current = onState;
  useEffect(() => {
    stateRef.current?.(playing && !off);
    return () => stateRef.current?.(false);
  }, [playing, off]);
  useEffect(() => {
    const el = video.current;
    if (!el) return;
    let dead = false;
    let started = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onPlaying = () => { started = true; clearTimeout(timer); setPlaying(true); };
    el.muted = !sound;
    el.addEventListener('playing', onPlaying);
    timer = setTimeout(() => {
      if (!started && !dead) { console.warn('Клип: видео не запустилось за 12 секунд', src); setOff(true); }
    }, 12000);
    void el.play().catch((e) => {
      if (dead) return;
      console.info('Клип: автозапуск со звуком не разрешён, играем без звука', e);
      el.muted = true;
      void el.play().catch(() => { /* сработает таймаут */ });
    });
    return () => {
      dead = true;
      clearTimeout(timer);
      el.removeEventListener('playing', onPlaying);
      el.pause();
    };
  }, [src, sound]);
  if (off) return null;
  return createPortal(
    <div className={`clip-overlay${playing ? ' on' : ''}`} role='dialog' aria-label='Клип трека' aria-hidden={!playing}>
      <div className='clip-video'>
        <video ref={video} src={url} loop muted playsInline preload='auto' aria-hidden onError={() => { console.warn('Клип: ошибка загрузки видео', src); setOff(true); }} />
      </div>
      <div className='clip-shade' />
      <div className='clip-stage'>{playing && children}</div>
      <button className='clip-close' aria-label='Закрыть клип' onClick={() => setOff(true)}><Icon name='x' size={20} /></button>
    </div>,
    document.body,
  );
}
