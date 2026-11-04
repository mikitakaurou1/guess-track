import { useState, type ReactNode } from 'react';
import '../styles/avatars.css';
export const avatarOptions = ['panda', 'crocodile', 'bear', 'cat', 'fox', 'owl', 'acorn'] as const;
export type AvatarId = typeof avatarOptions[number];
const INK = '#1f1b2e';
const meta: Record<AvatarId, { label: string; bg: string }> = {
  panda: { label: 'Панда', bg: '#ffd6e5' },
  crocodile: { label: 'Крокодил', bg: '#fff0a6' },
  bear: { label: 'Медведь', bg: '#cfe8ff' },
  cat: { label: 'Кот', bg: '#dcd2ff' },
  fox: { label: 'Лиса', bg: '#c8f1dc' },
  owl: { label: 'Сова', bg: '#ffe0b0' },
  acorn: { label: 'Жёлудь', bg: '#e0f2c6' },
};
export function validAvatar(id?: string): AvatarId { return avatarOptions.includes(id as AvatarId) ? id as AvatarId : 'panda'; }
const art: Record<AvatarId, ReactNode> = {
  panda: <>
    <circle cx='15' cy='15' r='9' fill={INK}/><circle cx='49' cy='15' r='9' fill={INK}/>
    <circle cx='32' cy='34' r='23' fill='#fff'/>
    <ellipse cx='22.5' cy='32' rx='6.5' ry='8.5' fill={INK} transform='rotate(25 22.5 32)'/>
    <ellipse cx='41.5' cy='32' rx='6.5' ry='8.5' fill={INK} transform='rotate(-25 41.5 32)'/>
    <circle cx='23.5' cy='31' r='2.4' fill='#fff'/><circle cx='40.5' cy='31' r='2.4' fill='#fff'/>
    <ellipse cx='32' cy='41' rx='4' ry='2.8' fill={INK}/>
    <path d='M32 43.5v2.5M27 47q5 4 10 0' fill='none' stroke={INK} strokeWidth='1.8' strokeLinecap='round'/>
  </>,
  crocodile: <>
    <circle cx='21' cy='17' r='8.5' fill='#4cc16a'/><circle cx='43' cy='17' r='8.5' fill='#4cc16a'/>
    <rect x='11' y='20' width='42' height='38' rx='17' fill='#4cc16a'/>
    <path d='M13 44q19 15 38 0v3a17 17 0 0 1-17 11h-4A17 17 0 0 1 13 47z' fill='#b5ecb0'/>
    <circle cx='21' cy='17' r='5.6' fill='#fff'/><circle cx='43' cy='17' r='5.6' fill='#fff'/>
    <circle cx='22' cy='18' r='2.7' fill={INK}/><circle cx='42' cy='18' r='2.7' fill={INK}/>
    <ellipse cx='26.5' cy='29' rx='2' ry='2.8' fill={INK}/><ellipse cx='37.5' cy='29' rx='2' ry='2.8' fill={INK}/>
    <path d='M16 43q16 10 32 0' fill='none' stroke={INK} strokeWidth='2.2' strokeLinecap='round'/>
    <path d='M21 46l2.4 4 2.6-3zM30 49l2.4 4 2.6-4zM39 47l2.6 3.4 2.4-4z' fill='#fff'/>
  </>,
  bear: <>
    <circle cx='15' cy='17' r='9' fill='#a56b3b'/><circle cx='49' cy='17' r='9' fill='#a56b3b'/>
    <circle cx='15' cy='17' r='4.5' fill='#e5b88a'/><circle cx='49' cy='17' r='4.5' fill='#e5b88a'/>
    <circle cx='32' cy='35' r='23' fill='#a56b3b'/>
    <ellipse cx='32' cy='43' rx='11' ry='9' fill='#e5b88a'/>
    <circle cx='23' cy='30' r='2.8' fill={INK}/><circle cx='41' cy='30' r='2.8' fill={INK}/>
    <circle cx='24' cy='29' r='0.9' fill='#fff'/><circle cx='42' cy='29' r='0.9' fill='#fff'/>
    <ellipse cx='32' cy='39' rx='4.6' ry='3.2' fill={INK}/>
    <path d='M32 42v3.5M27 46.5q5 4 10 0' fill='none' stroke={INK} strokeWidth='1.9' strokeLinecap='round'/>
  </>,
  cat: <>
    <path d='M10 30V6l17 12z' fill='#f59a23'/><path d='M54 30V6L37 18z' fill='#f59a23'/>
    <path d='M15 24V13l7 5z' fill='#ffb3c8'/><path d='M49 24V13l-7 5z' fill='#ffb3c8'/>
    <ellipse cx='32' cy='37' rx='23' ry='21' fill='#f59a23'/>
    <path d='M32 18v6M25 19l1.4 5M39 19l-1.4 5' stroke='#c26a0b' strokeWidth='2.4' strokeLinecap='round'/>
    <ellipse cx='22.5' cy='34' rx='3.4' ry='4' fill={INK}/><ellipse cx='41.5' cy='34' rx='3.4' ry='4' fill={INK}/>
    <circle cx='23.5' cy='32.6' r='1.2' fill='#fff'/><circle cx='42.5' cy='32.6' r='1.2' fill='#fff'/>
    <ellipse cx='32' cy='45' rx='9' ry='6.5' fill='#fff4e0'/>
    <path d='M29 40.5h6L32 44z' fill='#f06292'/>
    <path d='M32 44v2.5M27.5 47.5q4.5 3 4.5-1 0 4 4.5 1' fill='none' stroke={INK} strokeWidth='1.6' strokeLinecap='round' strokeLinejoin='round'/>
    <path d='M3 38l13 3M3 46l13-2M61 38l-13 3M61 46l-13-2' stroke='#fff' strokeWidth='1.7' strokeLinecap='round'/>
  </>,
  fox: <>
    <path d='M7 6l17 15q8-3 16 0L57 6l5 27Q58 52 32 60 6 52 2 33z' fill='#f2701a'/>
    <path d='M11 15l8 7-9 2zM53 15l-8 7 9 2z' fill='#5a2410'/>
    <path d='M2 33q12 8 30 8t30-8Q58 52 32 60 6 52 2 33z' fill='#fff4e6'/>
    <ellipse cx='21' cy='31' rx='3' ry='3.4' fill={INK}/><ellipse cx='43' cy='31' rx='3' ry='3.4' fill={INK}/>
    <circle cx='22' cy='29.8' r='1' fill='#fff'/><circle cx='44' cy='29.8' r='1' fill='#fff'/>
    <ellipse cx='32' cy='54' rx='4' ry='3' fill={INK}/>
    <path d='M32 57v1.5M28 58q4 2.5 8 0' fill='none' stroke={INK} strokeWidth='1.5' strokeLinecap='round'/>
  </>,
  owl: <>
    <path d='M10 22L7 4l16 9zM54 22l3-18-16 9z' fill='#8a6a47'/>
    <ellipse cx='32' cy='37' rx='24' ry='23' fill='#8a6a47'/>
    <ellipse cx='32' cy='47' rx='14' ry='12' fill='#ead9b6'/>
    <path d='M26 45q2 3 4 0M34 45q2 3 4 0M30 51q2 3 4 0' fill='none' stroke='#b89b6e' strokeWidth='1.6' strokeLinecap='round'/>
    <circle cx='22' cy='30' r='11' fill='#fff7e0'/><circle cx='42' cy='30' r='11' fill='#fff7e0'/>
    <circle cx='22' cy='30' r='5.6' fill={INK}/><circle cx='42' cy='30' r='5.6' fill={INK}/>
    <circle cx='23.8' cy='28' r='1.7' fill='#fff'/><circle cx='43.8' cy='28' r='1.7' fill='#fff'/>
    <path d='M13 19q8-5 15 2M51 19q-8-5-15 2' fill='none' stroke='#5b4430' strokeWidth='2.6' strokeLinecap='round'/>
    <path d='M28 35h8l-4 9z' fill='#f59e0b'/>
  </>,
  acorn: <>
    <path d='M33 12V5' stroke='#5a3510' strokeWidth='4' strokeLinecap='round'/>
    <path d='M35 8q9-6 14-1-6 6-14 1z' fill='#6fae1d'/>
    <path d='M14 30h36q2 18-11 27-4 3-7 5-3-2-7-5Q12 48 14 30z' fill='#d79a45'/>
    <ellipse cx='23' cy='42' rx='3.4' ry='7' fill='#fff' opacity='0.28' transform='rotate(12 23 42)'/>
    <path d='M8 31C6 17 18 11 32 11s26 6 24 20q-24 8-48 0z' fill='#7a4a1d'/>
    <path d='M16 17l9 13M27 13l7 17M39 13l7 17M30 14l-10 14M42 14l-9 16M52 19l-9 11' stroke='#5a3510' strokeWidth='1.5' opacity='0.55'/>
    <circle cx='25.5' cy='43' r='2.3' fill={INK}/><circle cx='38.5' cy='43' r='2.3' fill={INK}/>
    <path d='M28 49q4 3.5 8 0' fill='none' stroke={INK} strokeWidth='1.8' strokeLinecap='round'/>
  </>,
};
export default function Avatar({ id }: { id?: string; index?: number }) {
  const key = validAvatar(id);
  return <span className='avatar animal-avatar' style={{ background: meta[key].bg }} role='img' aria-label={meta[key].label}><svg viewBox='0 0 64 64' aria-hidden='true'>{art[key]}</svg></span>;
}
export function AvatarPicker({ value, onChange }: { value: string; onChange: (id: AvatarId) => void; index?: number }) {
  const [open, setOpen] = useState(false);
  return <div className='avatar-picker'>
    <button type='button' className='avatar-trigger' aria-label='Выбрать аватарку' aria-expanded={open} onClick={() => setOpen(!open)}><Avatar id={value}/></button>
    {open && <div className='avatar-menu' role='group' aria-label='Варианты аватарок'>
      {avatarOptions.map(id => <button type='button' key={id} aria-pressed={value === id} className={value === id ? 'selected' : ''} onClick={() => { onChange(id); setOpen(false); }}><Avatar id={id}/><span>{meta[id].label}</span></button>)}
    </div>}
  </div>;
}
