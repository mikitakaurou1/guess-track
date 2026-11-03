import type { ReactNode } from 'react';
import '../styles/ui.css';

export type IconName =
  | 'check' | 'x' | 'check-circle' | 'x-circle' | 'skip' | 'play' | 'volume' | 'mute'
  | 'phone' | 'globe' | 'shuffle' | 'list' | 'medal' | 'disc' | 'arrow-left' | 'arrow-right' | 'plus';

// Минималистичные линейные иконки 24x24, цвет берут из currentColor
const PATHS: Record<IconName, ReactNode> = {
  check: <path d='M5 12.5l4.5 4.5L19 7' />,
  x: (
    <>
      <path d='M6 6l12 12' />
      <path d='M18 6L6 18' />
    </>
  ),
  'check-circle': (
    <>
      <circle cx='12' cy='12' r='9' />
      <path d='M8 12.5l2.8 2.8L16 9.5' />
    </>
  ),
  'x-circle': (
    <>
      <circle cx='12' cy='12' r='9' />
      <path d='M9 9l6 6' />
      <path d='M15 9l-6 6' />
    </>
  ),
  skip: (
    <>
      <path d='M6 5.5l9 6.5-9 6.5z' />
      <path d='M18.5 5.5v13' />
    </>
  ),
  play: <path d='M7 5l12 7-12 7z' />,
  volume: (
    <>
      <path d='M4 9.5v5h3.5l4.5 4v-13l-4.5 4z' />
      <path d='M15.5 9a4 4 0 010 6' />
      <path d='M18 6.5a7.5 7.5 0 010 11' />
    </>
  ),
  mute: (
    <>
      <path d='M4 9.5v5h3.5l4.5 4v-13l-4.5 4z' />
      <path d='M16 9.5l5 5' />
      <path d='M21 9.5l-5 5' />
    </>
  ),
  phone: (
    <>
      <rect x='7' y='3' width='10' height='18' rx='2.5' />
      <path d='M11 17.5h2' />
    </>
  ),
  globe: (
    <>
      <circle cx='12' cy='12' r='9' />
      <path d='M3 12h18' />
      <path d='M12 3c3 3.2 3 14.8 0 18' />
      <path d='M12 3c-3 3.2-3 14.8 0 18' />
    </>
  ),
  shuffle: (
    <>
      <path d='M3 7h3c4 0 6 10 10 10h5' />
      <path d='M3 17h3c1.5 0 2.7-.8 3.7-2' />
      <path d='M13 9c.9-1.2 1.9-2 3-2h5' />
      <path d='M18 4l3 3-3 3' />
      <path d='M18 14l3 3-3 3' />
    </>
  ),
  list: (
    <>
      <path d='M9 6h11' />
      <path d='M9 12h11' />
      <path d='M9 18h11' />
      <path d='M4.5 6h.01' />
      <path d='M4.5 12h.01' />
      <path d='M4.5 18h.01' />
    </>
  ),
  medal: (
    <>
      <circle cx='12' cy='9' r='5.5' />
      <path d='M8.5 13.5L7 21l5-2.5 5 2.5-1.5-7.5' />
    </>
  ),
  disc: (
    <>
      <circle cx='12' cy='12' r='9' />
      <circle cx='12' cy='12' r='2.6' />
      <path d='M12 3.6a8.4 8.4 0 018.4 8.4' opacity='.5' />
    </>
  ),
  'arrow-left': (
    <>
      <path d='M19 12H5' />
      <path d='M11 6l-6 6 6 6' />
    </>
  ),
  'arrow-right': (
    <>
      <path d='M5 12h14' />
      <path d='M13 6l6 6-6 6' />
    </>
  ),
  plus: (
    <>
      <path d='M12 5v14' />
      <path d='M5 12h14' />
    </>
  ),
};

interface Props {
  name: IconName;
  size?: number;
  className?: string;
}

export default function Icon({ name, size = 18, className = '' }: Props) {
  return (
    <svg
      className={`icon ${className}`.trim()}
      width={size}
      height={size}
      viewBox='0 0 24 24'
      fill='none'
      stroke='currentColor'
      strokeWidth={1.8}
      strokeLinecap='round'
      strokeLinejoin='round'
      aria-hidden='true'
    >
      {PATHS[name]}
    </svg>
  );
}
