import { useEffect, useState } from 'react';
import Icon from './Icon';
import '../styles/ui.css';

// SoundCloud отдаёт обложку 100x100 (-large), заменяем на 500x500
const hiRes = (u: string) => u.replace('-large.', '-t500x500.');

interface Props {
  src?: string;
  size?: 'lg' | 'sm';
}

export default function Cover({ src, size = 'lg' }: Props) {
  const [stage, setStage] = useState(0);
  useEffect(() => setStage(0), [src]);

  const candidates = src ? (hiRes(src) === src ? [src] : [hiRes(src), src]) : [];
  const url = candidates[stage];

  return (
    <div className={`cover ${size}`}>
      {url ? (
        <img src={url} alt='' loading='lazy' onError={() => setStage((s) => s + 1)} />
      ) : (
        <Icon name='disc' size={size === 'lg' ? 64 : 22} />
      )}
    </div>
  );
}
