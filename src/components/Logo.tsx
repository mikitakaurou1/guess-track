import '../styles/logo.css';

const BARS = [22, 42, 58, 34, 18];

// Панель навигации в стиле iOS: иконка приложения с эквалайзером + надпись GuessTrack
export default function Logo() {
  return (
    <header className='logo'>
      <svg className='logo-mark' viewBox='0 0 96 96' width='34' height='34' aria-hidden='true'>
        <defs>
          <linearGradient id='logo-g' x1='0' y1='0' x2='0' y2='1'>
            <stop offset='0' stopColor='#86b0fa' />
            <stop offset='1' stopColor='#4a7fe0' />
          </linearGradient>
          <linearGradient id='logo-shine' x1='0' y1='0' x2='0' y2='1'>
            <stop offset='0' stopColor='#fff' stopOpacity='.4' />
            <stop offset='.55' stopColor='#fff' stopOpacity='0' />
          </linearGradient>
        </defs>
        <rect width='96' height='96' rx='22' fill='url(#logo-g)' />
        <rect width='96' height='96' rx='22' fill='url(#logo-shine)' />
        {BARS.map((h, i) => (
          <rect
            key={i}
            className='logo-eq-bar'
            x={18 + i * 13}
            y={48 - h / 2}
            width='8'
            height={h}
            rx='4'
            fill='#fff'
            style={{ animationDelay: `${i * 0.12}s` }}
          />
        ))}
      </svg>
      <h1>
        Guess<span>Track</span>
      </h1>
    </header>
  );
}
