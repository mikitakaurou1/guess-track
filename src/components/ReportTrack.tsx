import { useState } from 'react';
import Icon from './Icon';
import { artistOfTrack, reportTrack, type ReportReason } from '../services/artistsApi';
import '../styles/artists.css';

const REASONS: { id: ReportReason; label: string }[] = [
  { id: 'other-artist', label: 'Другой исполнитель' },
  { id: 'remix', label: 'Ремикс / перезалив' },
  { id: 'ai-cover', label: 'ИИ-кавер' },
];

export default function ReportTrack({ trackId }: { trackId: number }) {
  const artistId = artistOfTrack(trackId);
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<'idle' | 'busy' | 'done' | 'error'>('idle');
  if (!artistId) return null;
  const send = async (reason: ReportReason) => {
    setStatus('busy');
    setOpen(false);
    try {
      await reportTrack(artistId, trackId, reason);
      setStatus('done');
    } catch {
      setStatus('error');
    }
  };
  if (status === 'done') return <div className='report-note'><Icon name='check-circle' size={16} /> Трек убран из каталога артиста</div>;
  return (
    <div className='report'>
      <button className='btn btn-ghost' onClick={() => setOpen(o => !o)} disabled={status === 'busy'} aria-expanded={open}>
        <Icon name='x-circle' size={16} /> Не тот трек
      </button>
      {open && (
        <div className='report-menu' role='menu'>
          {REASONS.map(r => <button key={r.id} className='chip' role='menuitem' onClick={() => send(r.id)}>{r.label}</button>)}
        </div>
      )}
      {status === 'error' && <div className='report-note'>Не удалось отправить. Попробуйте ещё раз.</div>}
    </div>
  );
}
