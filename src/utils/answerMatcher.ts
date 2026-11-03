function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/\(.*?\)|\[.*?\]/g, ' ')
    .replace(/\s(?:w\/|feat\.?\s|ft\.?\s|featuring\s|prod\.?\s).*$/, ' ')
    .replace(/\b(official|audio|video|lyrics|remix)\b.*$/, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const rawNormalize = (s: string) =>
  s.toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();

function levenshtein(a: string, b: string): number {
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    prev = cur;
  }
  return prev[b.length];
}

export function isCorrectAnswer(answer: string, title: string): boolean {
  if (!title || !answer) return false;
  const a = normalize(answer) || rawNormalize(answer);
  if (!a) return false;

  const candidates = new Set<string>([title, ...title.split(/\s[-–—]\s/)]);
  for (const c of candidates) {
    const t = normalize(c) || rawNormalize(c);
    if (!t) continue;
    if (t === a) return true;
    if (a.length < 3 || t.length < 3) continue; // короткие — только точное совпадение

    const aw = a.split(' ');
    const tw = new Set(t.split(' '));
    if (aw.length >= 2 && aw.every((w) => tw.has(w))) return true;

    if (a.length >= 4 && t.includes(a) && a.length >= t.length * 0.6) return true;
    const similarity = 1 - levenshtein(a, t) / Math.max(a.length, t.length);
    if (similarity >= 0.8) return true;
  }
  return false;
}