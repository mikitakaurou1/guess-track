// DEBUG-LOG: временная панель, потом удалить файл целиком
import { useEffect, useRef, useState } from 'react';
import type { LogEntry } from '../hooks/useGame';

const COLORS = { info: '#cbd5e1', ok: '#4ade80', fail: '#f87171' } as const;

export default function DebugLog({ entries, onClear }: { entries: LogEntry[]; onClear: () => void }) {
  const [open, setOpen] = useState(true);
  const [copied, setCopied] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => { if (box.current) box.current.scrollTop = box.current.scrollHeight; }, [entries, open]);
  if (!entries.length) return null;
  const fails = entries.filter(e => e.kind === 'fail').length;
  const copy = () => {
    const text = entries.map(e => `${e.time} ${e.text}`).join('\n');
    navigator.clipboard?.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); });
  };
  const btn = { background: 'rgba(255,255,255,0.12)', color: '#fff', border: 0, borderRadius: 6, padding: '3px 8px', fontSize: 12, cursor: 'pointer' } as const;
  return (
    <div style={{ position: 'fixed', right: 8, bottom: 8, zIndex: 9999, width: 'min(440px, 94vw)', background: 'rgba(8,6,20,0.92)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 10, color: '#fff', font: '12px/1.4 monospace', boxShadow: '0 8px 30px rgba(0,0,0,0.5)' }}>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', padding: '6px 8px' }}>
        <b style={{ flex: 1 }}>Лог загрузки · пропущено: <span style={{ color: fails ? COLORS.fail : COLORS.ok }}>{fails}</span></b>
        <button style={btn} onClick={copy}>{copied ? 'Скопировано' : 'Копировать'}</button>
        <button style={btn} onClick={onClear}>Очистить</button>
        <button style={btn} onClick={() => setOpen(o => !o)}>{open ? 'Свернуть' : 'Развернуть'}</button>
      </div>
      {open && (
        <div ref={box} style={{ maxHeight: '38vh', overflowY: 'auto', padding: '0 8px 8px' }}>
          {entries.map(e => (
            <div key={e.id} style={{ color: COLORS[e.kind], padding: '2px 0', borderTop: '1px solid rgba(255,255,255,0.06)', wordBreak: 'break-word' }}>
              <span style={{ opacity: 0.55 }}>{e.time}</span> {e.text}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
