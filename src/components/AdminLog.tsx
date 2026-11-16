import { useEffect, useRef, useState } from 'react';
import { useIsAdmin } from '../hooks/useIsAdmin';
import { clearGameLog, useGameLog } from '../utils/gameLog';
import '../styles/adminLog.css';

const OPEN_KEY = 'guesstrackLogOpen';
const time = (t: number): string => new Date(t).toLocaleTimeString('ru-RU', { hour12: false });

export default function AdminLog() {
  const admin = useIsAdmin();
  const entries = useGameLog();
  const [open, setOpen] = useState(() => localStorage.getItem(OPEN_KEY) !== '0');
  const [copied, setCopied] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  useEffect(() => { const el = bodyRef.current; if (el) el.scrollTop = el.scrollHeight; }, [entries, open, admin]);
  if (!admin) return null;
  const toggle = () => setOpen(o => { localStorage.setItem(OPEN_KEY, o ? '0' : '1'); return !o; });
  const copy = () => {
    const text = entries.map(e => `${time(e.at)} ${e.text}`).join('\n');
    navigator.clipboard?.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }).catch(() => { /* буфер недоступен */ });
  };
  return <aside className={`alog${open ? '' : ' alog-closed'}`} aria-label='Журнал игры (для админа)'>
    <div className='alog-head'>
      <button className='alog-title' onClick={toggle} aria-expanded={open}>Журнал{entries.length ? ` (${entries.length})` : ''} {open ? '▾' : '▴'}</button>
      {open && <>
        <button className='alog-btn' onClick={copy}>{copied ? 'Скопировано' : 'Копировать'}</button>
        <button className='alog-btn' onClick={clearGameLog}>Очистить</button>
      </>}
    </div>
    {open && <div className='alog-body' ref={bodyRef}>
      {entries.length === 0 && <div className='alog-empty'>Пока пусто. Запустите игру.</div>}
      {entries.map(e => <div key={e.id} className={`alog-row alog-${e.level}`}><span className='alog-time'>{time(e.at)}</span>{e.text}</div>)}
    </div>}
  </aside>;
}
