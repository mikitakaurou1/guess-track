import { useEffect, useRef, useState } from 'react';
import Icon from './Icon';
import '../styles/reverse.css';
const time = (n: number) => { const v = Number.isFinite(n) ? Math.max(0, n) : 0; return `${Math.floor(v / 60)}:${String(Math.floor(v % 60)).padStart(2, '0')}`; };
export default function ReverseAudio({ src, paused, onError }: { src: string; paused: boolean; onError: () => void }) {
  const ref = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [position, setPosition] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [hint, setHint] = useState('');
  const play = () => { void ref.current?.play().catch(() => setHint('Нажмите воспроизведение ещё раз, чтобы разрешить звук.')); };
  useEffect(() => {
    if (paused) ref.current?.pause();
    else void ref.current?.play().catch(() => setHint('Нажмите воспроизведение, чтобы включить звук.'));
  }, [paused, src]);
  return <div className='reverse-audio'>
    <audio ref={ref} src={src} preload='auto' onLoadedMetadata={e => setDuration(Number.isFinite(e.currentTarget.duration) ? e.currentTarget.duration : 0)} onTimeUpdate={e => setPosition(e.currentTarget.currentTime)} onPlay={() => { setPlaying(true); setHint(''); }} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)} onError={onError}/>
    <div className='reverse-audio-top'><span className='step'>Обратное воспроизведение</span><span className='muted small'>Перевертыш</span></div>
    <div className='reverse-audio-main'>
      <button className='reverse-play' aria-label={playing ? 'Пауза' : 'Воспроизвести'} onClick={() => { if (playing) ref.current?.pause(); else play(); }}>{playing ? <svg width='24' height='24' viewBox='0 0 24 24' aria-hidden='true'><rect x='6' y='4' width='4' height='16' rx='1' fill='currentColor'/><rect x='14' y='4' width='4' height='16' rx='1' fill='currentColor'/></svg> : <Icon name='play' size={26}/>}</button>
      <div className='reverse-progress'><input className='reverse-seek' aria-label='Позиция воспроизведения' type='range' min={0} max={duration || 1} step={0.01} value={Math.min(position, duration || 1)} disabled={!duration} style={{ background: `linear-gradient(90deg, var(--v) 0%, var(--p) ${duration ? position / duration * 100 : 0}%, rgba(255,255,255,.12) ${duration ? position / duration * 100 : 0}%)` }} onChange={e => { const n = Number(e.target.value); if (ref.current) ref.current.currentTime = n; setPosition(n); }}/><div className='reverse-times'><span>{time(position)}</span><span>{time(duration)}</span></div></div>
    </div>
    <div className='reverse-audio-bottom'><button className='btn btn-ghost' onClick={() => { if (ref.current) ref.current.currentTime = 0; setPosition(0); play(); }}>С начала</button><div className='reverse-volume'><button className='reverse-mute' aria-label={muted ? 'Включить звук' : 'Выключить звук'} onClick={() => { if (ref.current) ref.current.muted = !muted; setMuted(v => !v); }}><Icon name={muted || volume === 0 ? 'mute' : 'volume'} size={20}/></button><input className='range' aria-label='Громкость' type='range' min={0} max={1} step={0.01} value={muted ? 0 : volume} onChange={e => { const v = Number(e.target.value); setVolume(v); setMuted(false); if (ref.current) { ref.current.volume = v; ref.current.muted = false; } }}/></div></div>
    {hint && <p className='muted small'>{hint}</p>}
  </div>;
}
