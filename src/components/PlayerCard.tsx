import Icon from './Icon';
import Avatar from './Avatar';
interface Props { name: string; avatar?: string; index: number; score: number; active: boolean; locked: boolean; disabled: boolean; remote?: boolean; keyHint?: string; onBuzz: () => void; }
export default function PlayerCard({ name, avatar, index, score, active, locked, disabled, remote, keyHint, onBuzz }: Props) {
  const cls = ['player', active && 'active', locked && 'locked'].filter(Boolean).join(' ');
  // Нажатие срабатывает в момент касания (pointerdown), а не после отпускания пальца. preventDefault не даёт браузеру
  // отобрать фокус у поля ответа и убирает «двойное» срабатывание; click обрабатываем только для клавиатуры (detail === 0)
  return <div className={cls}><div className='player-head'><Avatar id={avatar} index={index}/><div><div className='player-name'>{name}</div><div className='muted small'>{keyHint ?? (remote ? <><Icon name='phone' size={13}/> своё устройство</> : '')}</div></div><div className='player-score'>{score}</div></div><button className='buzz' disabled={disabled} onPointerDown={e => { if (disabled || e.button !== 0) return; e.preventDefault(); e.currentTarget.blur(); onBuzz(); }} onClick={e => { if (e.detail === 0) { e.currentTarget.blur(); onBuzz(); } }}>{locked ? 'Выбыл' : 'ЖМУ!'}</button></div>;
}
