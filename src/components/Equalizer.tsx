export default function Equalizer({ active }: { active: boolean }) {
  return (
    <div className={`eq ${active ? 'active' : ''}`} aria-hidden>
      {Array.from({ length: 24 }, (_, i) => (
        <span key={i} style={{ animationDelay: `${(i % 7) * 0.11}s`, animationDuration: `${0.7 + (i % 5) * 0.15}s` }} />
      ))}
    </div>
  );
}