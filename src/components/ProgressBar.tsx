export default function ProgressBar({ fraction }: { fraction: number }) {
  const pct = Math.min(100, Math.max(0, fraction * 100));
  return (
    <div className="bar">
      <div style={{ width: `${pct}%` }} />
    </div>
  );
}