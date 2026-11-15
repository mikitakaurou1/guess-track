import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Icon from './Icon';
import { loadYouTubeApi } from '../services/youtube';
import '../styles/clip.css';

interface Props {
  videoId: string;
  title: string;
  artist: string;
  sound?: boolean; // пробуем со звуком; если браузер не разрешил, играем без звука
  isLast?: boolean;
  nextBusy?: boolean;
  onNext?: () => void;
}

export default function ClipBackdrop({ videoId, title, artist, sound, isLast, nextBusy, onNext }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(false);
  const [off, setOff] = useState(false);
  useEffect(() => {
    let dead = false;
    let started = false;
    let failTimer: ReturnType<typeof setTimeout> | undefined;
    let soundTimer: ReturnType<typeof setTimeout> | undefined;
    let player: { destroy(): void } | null = null;
    const fail = () => { if (!dead) setOff(true); };
    loadYouTubeApi().then((YT) => {
      if (dead || !host.current) return;
      const mount = document.createElement('div');
      host.current.appendChild(mount);
      player = new YT.Player(mount, {
        videoId,
        playerVars: { autoplay: 1, mute: sound ? 0 : 1, controls: 0, disablekb: 1, fs: 0, rel: 0, playsinline: 1, loop: 1, playlist: videoId, modestbranding: 1, iv_load_policy: 3 },
        events: {
          onReady: (e) => {
            if (!sound) e.target.mute();
            e.target.playVideo();
            if (sound) soundTimer = setTimeout(() => { if (!started) { e.target.mute(); e.target.playVideo(); } }, 2500);
          },
          onStateChange: (e) => {
            if (e.data === 1) { started = true; clearTimeout(failTimer); clearTimeout(soundTimer); setPlaying(true); }
          },
          onError: fail,
        },
      });
      failTimer = setTimeout(() => { if (!started) fail(); }, 9000);
    }).catch(fail);
    return () => {
      dead = true;
      clearTimeout(failTimer);
      clearTimeout(soundTimer);
      try { player?.destroy(); } catch { /* уже удалён */ }
    };
  }, [videoId, sound]);
  if (off) return null;
  return createPortal(
    <div className={`clip-overlay${playing ? ' on' : ''}`} role='dialog' aria-label='Клип трека' aria-hidden={!playing}>
      <div className='clip-video' ref={host} aria-hidden />
      <div className='clip-shade' />
      <button className='clip-close' aria-label='Закрыть клип' onClick={() => setOff(true)}><Icon name='x' size={20} /></button>
      <div className='clip-content'>
        <div className='clip-title'>{title || 'Название недоступно'}</div>
        {artist && <div className='clip-artist'>{artist}</div>}
        {onNext && (
          <button className='btn btn-primary clip-next' onClick={onNext} disabled={nextBusy}>
            {nextBusy ? 'Загружаем следующий трек…' : isLast ? 'К итогам' : 'Дальше'}
            {!nextBusy && <Icon name='arrow-right' size={16} />}
          </button>
        )}
      </div>
      <a className='clip-yt' href={`https://www.youtube.com/watch?v=${videoId}`} target='_blank' rel='noreferrer'>Смотреть на YouTube</a>
    </div>,
    document.body,
  );
}
