import '../styles/logo.css';

const BARS = [22, 42, 58, 34, 18];

// Логотип: градиентная плитка с эквалайзером + надпись Guess·Track
export default function Logo() {
  return (
    <header className='logo'>
      <svg className='logo-mark' viewBox='0 0 96 96' width='52' height='52' aria-hidden='true'>
        <defs>
          <linearGradient id='logo-g' x1='0' y1='0' x2='1' y2='1'>
            <stop offset='0' stopColor='#ff6fa8' />
            <stop offset='.55' stopColor='#c26bff' />
            <stop offset='1' stopColor='#6f8cff' />
          </linearGradient>
          <linearGradient id='logo-shine' x1='0' y1='0' x2='0' y2='1'>
            <stop offset='0' stopColor='#fff' stopOpacity='.55' />
            <stop offset='.5' stopColor='#fff' stopOpacity='0' />
          </linearGradient>
        </defs>
        <rect width='96' height='96' rx='30' fill='url(#logo-g)' />
        <rect width='96' height='96' rx='30' fill='url(#logo-shine)' />
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
