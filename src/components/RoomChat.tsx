import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { chatSnapshot, reactions, sendChat, subscribeChat } from '../services/roomChat';
import '../styles/roomChat.css';
export default function RoomChat() {
  const { connected, messages } = useSyncExternalStore(subscribeChat, chatSnapshot);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [cooldown, setCooldown] = useState(false);
  const [visible, setVisible] = useState<string[]>([]);
  const seen = useRef(new Set<string>());
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!connected) { seen.current.clear(); setVisible([]); setOpen(false); setText(''); timers.current.forEach(clearTimeout); timers.current = []; return; }
    const fresh = messages.filter(m => !seen.current.has(m.id));
    seen.current = new Set(messages.map(m => m.id));
    if (!fresh.length) return;
    setVisible(v => [...v, ...fresh.map(m => m.id)].slice(-4));
    timers.current = timers.current.slice(-80);
    fresh.forEach(m => timers.current.push(setTimeout(() => setVisible(v => v.filter(id => id !== m.id)), 6500)));
  }, [messages, connected]);
  useEffect(() => { if (open) end.current?.scrollIntoView({ block: 'nearest' }); }, [messages, open]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const post = (value: string, reaction = false) => {
    const clean = value.trim(); if (!clean || cooldown) return;
    sendChat(clean, reaction); if (!reaction) setText('');
    setCooldown(true); timers.current.push(setTimeout(() => setCooldown(false), 1000));
  };
  if (!connected) return null;
  return <aside className='room-chat' aria-label='Чат комнаты'
    onKeyDown={e => e.stopPropagation()} onKeyUp={e => e.stopPropagation()} onKeyPress={e => e.stopPropagation()}>
    {!open && <div className='room-chat-floats' aria-live='polite' aria-relevant='additions'>
      {messages.filter(m => visible.includes(m.id)).map(m => <div key={m.id} className={`room-chat-bubble${m.reaction ? ' is-reaction' : ''}`}><small>{m.name}</small><span>{m.text}</span></div>)}
    </div>}
    {open && <section className='room-chat-panel' aria-label='Сообщения'>
      <header><strong>Чат комнаты</strong><button type='button' aria-label='Свернуть чат' onClick={() => setOpen(false)}>×</button></header>
      <div className='room-chat-history' role='log' aria-live='polite'>
        {!messages.length && <p>Здесь появятся сообщения и реакции.</p>}
        {messages.map(m => <div className={`room-chat-entry${m.reaction ? ' is-reaction' : ''}`} key={m.id}><small>{m.name}</small><span>{m.text}</span></div>)}<div ref={end}/>
      </div>
      <form onSubmit={e => { e.preventDefault(); post(text); }}><input aria-label='Сообщение в комнату' placeholder='Сообщение…' maxLength={300} value={text} onChange={e => setText(e.target.value)}/><button type='submit' disabled={cooldown || !text.trim()}>Отправить</button></form>
    </section>}
    <div className='room-chat-controls'><button type='button' aria-expanded={open} onClick={() => setOpen(v => !v)}>{open ? 'Свернуть' : 'Чат'}</button>
      {reactions.map((r,i) => <button type='button' key={r} aria-label={['Радость','Злость','Грусть'][i]} disabled={cooldown} onClick={() => post(r,true)}>{r}</button>)}
    </div>
  </aside>;
}
