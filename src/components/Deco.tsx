import '../styles/deco.css';

function Disc({ side }: { side: 'l' | 'r' }) {
  return (
    <div className={`deco-disc ${side}`} aria-hidden='true'>
      <div className='spin'>
        <div className='label' />
      </div>
      <div className='sheen' />
    </div>
  );
}

// Декор фона: точечная сетка, кольца за карточкой и две виниловые пластинки по краям
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
      <Disc side='l' />
      <Disc side='r' />
    </>
  );
}
