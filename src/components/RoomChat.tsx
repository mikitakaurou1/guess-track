import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { chatSnapshot, reactions, sendChat, subscribeChat } from '../services/roomChat';
import '../styles/roomChat.css';

const labels = ['Радость', 'Злость', 'Грусть'];
function Reaction({ value }: { value: string }) {
  const mood = reactions.indexOf(value as typeof reactions[number]);
  if (mood < 0) return <span>{value}</span>;
  return <svg className={`rc-face rc-face-${mood}`} viewBox='0 0 100 100' role='img' aria-label={labels[mood]}>
    <g className='rc-head'>
      <circle cx='50' cy='49' r='29' className='rc-face-fill'/>
      <path d='M29 39 Q34 23 51 24' fill='none' stroke='white' strokeOpacity='.28' strokeWidth='4' strokeLinecap='round'/>
      <g fill='none' stroke='#20273d' strokeWidth='3.5' strokeLinecap='round' strokeLinejoin='round'>
        {mood === 0 && <><path d='M35 43 Q39 36 43 43 M57 43 Q61 36 65 43'/><path d='M35 53 Q50 75 65 53 Z' fill='#20273d'/><path d='M43 63 Q50 58 57 63' stroke='#d49aaa'/></>}
        {mood === 1 && <><path d='M33 35 L43 40 M67 35 L57 40 M38 45 L38 48 M62 45 L62 48 M40 63 Q50 54 60 63'/><path d='M48 53 L52 53'/></>}
        {mood === 2 && <><path d='M33 36 Q38 39 43 33 M57 33 Q62 39 67 36 M36 45 Q39 42 42 45 M58 45 Q61 42 64 45 M41 64 Q50 54 59 64'/></>}
      </g>
      <ellipse cx='31' cy='53' rx='5' ry='3' fill='#d49aaa' opacity='.55'/><ellipse cx='69' cy='53' rx='5' ry='3' fill='#d49aaa' opacity='.55'/>
    </g>
    {mood === 0 && <g className='rc-sparks' fill='none' stroke='var(--gold)' strokeWidth='2.5' strokeLinecap='round'><path d='M16 20 V30 M11 25 H21'/><path d='M81 13 V23 M76 18 H86'/><path d='M82 66 V74 M78 70 H86'/></g>}
    {mood === 2 && <g fill='var(--c)' stroke='#c6edf0' strokeWidth='1'><path className='rc-tear rc-tear-a' d='M34 49 Q25 61 34 63 Q43 61 34 49Z'/><path className='rc-tear rc-tear-b' d='M66 49 Q57 61 66 63 Q75 61 66 49Z'/></g>}
    {mood === 1 && <g fill='none' stroke='var(--txt)' strokeWidth='3.5' strokeLinecap='round'><path className='rc-steam rc-steam-a' d='M23 49 C8 50 20 37 10 33'/><path className='rc-steam rc-steam-b' d='M77 49 C92 50 80 37 90 33'/><path className='rc-steam rc-steam-c' d='M46 55 C42 63 32 57 29 67 M54 55 C58 63 68 57 71 67'/></g>}
  </svg>;
}

export default function RoomChat() {
  const { connected, messages } = useSyncExternalStore(subscribeChat, chatSnapshot);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [cooldown, setCooldown] = useState(false);
  const [visible, setVisible] = useState<string[]>([]);
  const seen = useRef(new Set<string>());
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  const end = useRef<HTMLDivElement>(null);
  const later = (fn: () => void, ms: number) => {
    const timer = setTimeout(() => { timers.current.delete(timer); fn(); }, ms);
    timers.current.add(timer);
  };
  useEffect(() => {
    if (!connected) {
      seen.current.clear(); setVisible([]); setOpen(false); setText(''); setCooldown(false);
      timers.current.forEach(clearTimeout); timers.current.clear(); return;
    }
    const fresh = messages.filter(m => !seen.current.has(m.id));
    seen.current = new Set(messages.map(m => m.id));
    if (!fresh.length) return;
    setVisible(v => [...v, ...fresh.map(m => m.id)].slice(-4));
    fresh.forEach(m => later(() => setVisible(v => v.filter(id => id !== m.id)), 6500));
  }, [messages, connected]);
  useEffect(() => { if (open) end.current?.scrollIntoView({ block: 'nearest' }); }, [messages, open]);
  useEffect(() => () => { timers.current.forEach(clearTimeout); timers.current.clear(); }, []);
  const post = (value: string, reaction = false) => {
    const clean = value.trim(); if (!clean || cooldown) return;
    sendChat(clean, reaction); if (!reaction) setText('');
    setCooldown(true); later(() => setCooldown(false), 1000);
  };
  if (!connected) return null;
  return <aside className='room-chat' aria-label='Чат комнаты' onKeyDown={e => e.stopPropagation()} onKeyUp={e => e.stopPropagation()} onKeyPress={e => e.stopPropagation()}>
    {!open && <div className='room-chat-floats' aria-live='polite' aria-relevant='additions'>
      {messages.filter(m => visible.includes(m.id)).map(m => <div key={m.id} className={`room-chat-bubble${m.reaction ? ' is-reaction' : ''}`}><small>{m.name}</small>{m.reaction ? <Reaction value={m.text}/> : <span className='rc-text'>{m.text}</span>}</div>)}
    </div>}
    {open && <section className='room-chat-panel' aria-label='Сообщения'>
      <header className='rc-header'><div><span className='rc-eyebrow'>GUESS TRACK / LIVE</span><h2>Чат комнаты</h2></div><button className='rc-close' type='button' aria-label='Свернуть чат' onClick={() => setOpen(false)}>×</button></header>
      <div className='room-chat-history' role='log' aria-live='polite'>
        {!messages.length && <div className='rc-empty'><Reaction value={reactions[0]}/><p>На одной волне</p><small>Отправь сообщение или подбодри друзей реакцией.</small></div>}
        {messages.map(m => <div className={`room-chat-entry${m.reaction ? ' is-reaction' : ''}`} key={m.id}><small>{m.name}</small>{m.reaction ? <Reaction value={m.text}/> : <span className='rc-text'>{m.text}</span>}</div>)}<div ref={end}/>
      </div>
      <form onSubmit={e => { e.preventDefault(); post(text); }}><input className='input' aria-label='Сообщение в комнату' placeholder='На одной волне…' maxLength={300} value={text} onChange={e => setText(e.target.value)}/><button className='btn btn-primary rc-send' type='submit' aria-label='Отправить сообщение' disabled={cooldown || !text.trim()}><svg viewBox='0 0 24 24' width='20' height='20' aria-hidden='true'><path d='M5 12H19 M13 6L19 12L13 18' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round'/></svg></button></form>
    </section>}
    <div className='room-chat-controls'><button className='chip rc-toggle' type='button' aria-expanded={open} onClick={() => setOpen(v => !v)}><svg width='18' height='18' viewBox='0 0 24 24' aria-hidden='true'><path d='M5 4H19A2 2 0 0 1 21 6V15A2 2 0 0 1 19 17H10L4 21V6A2 2 0 0 1 5 4Z' fill='none' stroke='currentColor' strokeWidth='1.8' strokeLinejoin='round'/></svg>{open ? 'Свернуть' : 'Чат'}</button>
      <div className='rc-reactions' aria-label='Быстрые реакции'>{reactions.map((r,i) => <button className='rc-react' type='button' key={r} title={labels[i]} aria-label={labels[i]} disabled={cooldown} onClick={() => post(r,true)}><Reaction value={r}/></button>)}</div>
    </div>
  </aside>;
}
