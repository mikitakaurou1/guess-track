import { useState, type ReactNode } from 'react';
import '../styles/avatars.css';
export const avatarOptions = ['panda', 'crocodile', 'bear', 'cat', 'fox', 'owl', 'acorn'] as const;
export type AvatarId = typeof avatarOptions[number];
const labels: Record<AvatarId, string> = { panda: 'Панда', crocodile: 'Крокодил', bear: 'Медведь', cat: 'Кот', fox: 'Лиса', owl: 'Сова', acorn: 'Жёлудь' };
export function validAvatar(id?: string): AvatarId { return avatarOptions.includes(id as AvatarId) ? id as AvatarId : 'panda'; }
const eyes = <><circle cx='25' cy='31' r='2' fill='currentColor' stroke='none'/><circle cx='39' cy='31' r='2' fill='currentColor' stroke='none'/></>;
const art: Record<AvatarId, ReactNode> = {
  panda: <><circle cx='17' cy='17' r='8' fill='currentColor'/><circle cx='47' cy='17' r='8' fill='currentColor'/><ellipse cx='32' cy='34' rx='22' ry='21' fill='#fff'/><ellipse cx='23' cy='31' rx='6' ry='8' fill='currentColor' transform='rotate(24 23 31)'/><ellipse cx='41' cy='31' rx='6' ry='8' fill='currentColor' transform='rotate(-24 41 31)'/><circle cx='24' cy='30' r='2' fill='#fff' stroke='none'/><circle cx='40' cy='30' r='2' fill='#fff' stroke='none'/><path d='M28 41h8l-4 4z' fill='currentColor'/><path d='M32 45v3m-5 0q5 5 10 0'/></>,
  crocodile: <><path d='M11 31l5-8 7 4 6-9 6 8 8-6 3 10h8v17H20Q9 47 11 31z' fill='#86efac'/><circle cx='36' cy='24' r='7' fill='#86efac'/><circle cx='37' cy='24' r='2' fill='currentColor'/><path d='M25 38h29M31 38v5m9-5v5m9-5v5'/><circle cx='50' cy='32' r='1.5' fill='currentColor'/></>,
  bear: <><circle cx='17' cy='18' r='8' fill='#d6a36f'/><circle cx='47' cy='18' r='8' fill='#d6a36f'/><circle cx='32' cy='35' r='22' fill='#d6a36f'/>{eyes}<ellipse cx='32' cy='43' rx='10' ry='8' fill='#fde6c8'/><path d='M28 39h8l-4 4z' fill='currentColor'/><path d='M32 43v5m-5-1q5 5 10 0'/></>,
  cat: <><path d='M13 30V11l17 10h4l17-10v19a21 21 0 1 1-38 0z' fill='#c4b5fd'/>{eyes}<path d='M29 40h6l-3 3z' fill='currentColor'/><path d='M32 43v5M7 38l13 3M7 47l13-2m24-4 13-3m-13 7 13 2'/></>,
  fox: <><path d='M10 10l20 12h4l20-12-3 28-19 18-19-18z' fill='#fb923c'/><path d='M13 33l19 8 19-8-19 23z' fill='#fff7ed' stroke='none'/>{eyes}<path d='M28 42h8l-4 5z' fill='currentColor'/></>,
  owl: <><path d='M12 12l17 7h6l17-7v25a20 20 0 0 1-40 0z' fill='#a5b4fc'/><circle cx='23' cy='31' r='10' fill='#eef2ff'/><circle cx='41' cy='31' r='10' fill='#eef2ff'/><circle cx='23' cy='31' r='3' fill='currentColor'/><circle cx='41' cy='31' r='3' fill='currentColor'/><path d='M28 40h8l-4 7z' fill='#fbbf24'/><path d='M25 51v5m14-5v5'/></>,
  acorn: <><path d='M32 18q-2-11 8-13' fill='none' stroke='#a3e635' strokeWidth='4'/><path d='M16 29h32v7q0 15-16 23Q16 51 16 36z' fill='#d6a36f'/><path d='M11 29q1-14 21-14t21 14v5H11z' fill='#a3e635'/><path d='M19 22l6 6m3-9 7 7m5-5 6 6M22 40q0 8 7 11' stroke='#fff' opacity='.55'/></>,
};
export default function Avatar({ id, index = 0 }: { id?: string; index?: number }) {
  const key = validAvatar(id);
  return <span className={`avatar animal-avatar c${index % 5}`} role='img' aria-label={labels[key]}><svg viewBox='0 0 64 64' width='32' height='32' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round' aria-hidden='true'>{art[key]}</svg></span>;
}
export function AvatarPicker({ value, onChange, index = 0 }: { value: string; onChange: (id: AvatarId) => void; index?: number }) {
  const [open, setOpen] = useState(false);
  return <div className='avatar-picker'><button type='button' className='avatar-trigger' aria-label='Выбрать аватарку' aria-expanded={open} onClick={() => setOpen(!open)}><Avatar id={value} index={index}/></button>{open && <div className='avatar-menu' role='group' aria-label='Варианты аватарок'>{avatarOptions.map(id => <button type='button' key={id} title={labels[id]} aria-label={labels[id]} aria-pressed={value === id} className={value === id ? 'selected' : ''} onClick={() => { onChange(id); setOpen(false); }}><Avatar id={id} index={index}/></button>)}</div>}</div>;
}
