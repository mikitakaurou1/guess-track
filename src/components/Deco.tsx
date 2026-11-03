import '../styles/deco.css';

const HEIGHTS = [60, 110, 170, 240, 190, 130, 90, 50];

function Bars({ side }: { side: 'l' | 'r' }) {
  const hs = side === 'l' ? HEIGHTS : [...HEIGHTS].reverse();
  return (
    <div className={`deco-bars ${side}`} aria-hidden='true'>
      {hs.map((h, i) => (
        <span key={i} style={{ height: h, animationDelay: `${-i * 0.45}s` }} />
      ))}
    </div>
  );
}

// Лаконичный декор фона: точечная сетка, кольца-«пластинка» за карточкой и две колонки эквалайзера по бокам
export default function Deco() {
  return (
    <>
      <div className='bg-grid' aria-hidden='true' />
      <div className='bg-rings' aria-hidden='true'>
        <i />
        <i />
        <i />
        <i />
      </div>
      <Bars side='l' />
      <Bars side='r' />
    </>
  );
}
