const COLLAB = new Set(['x', 'х', '×', 'feat', 'feat.', 'ft', 'ft.', 'featuring', 'w/', 'vs', 'vs.', 'prod', 'prod.']);

// Сколько опечаток допускается (по длине названия). Верните 0, чтобы опечатки не прощались совсем.
function typoBudget(len: number): number {
  if (len < 9) return 0;
  if (len < 16) return 1;
  return 2;
}

function squash(s: string): string {
  return s
    .toLowerCase()
    .replace(/ё/g, 'е')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripBrackets(s: string): string {
  return s.replace(/\([^)]*\)|\[[^\]]*\]/g, ' ');
}

function splitDash(s: string): string[] {
  return s.split(' - ').flatMap((p) => p.split(' – ')).flatMap((p) => p.split(' — '));
}

// «LIPSTICK x 9mice» -> «LIPSTICK», «Название w/ Кто-то» -> «Название»
function cutCollab(raw: string): string {
  const tokens = raw.trim().split(' ').filter(Boolean);
  for (let i = 1; i < tokens.length; i++) {
    if (COLLAB.has(tokens[i].toLowerCase())) return tokens.slice(0, i).join(' ');
  }
  return raw;
}

function candidates(title: string): Set<string> {
  const base = stripBrackets(title);
  const raws = [base];
  const parts = splitDash(base).map((p) => p.trim()).filter(Boolean);
  if (parts.length > 1) raws.push(...parts, parts.slice(1).join(' - '));

  const out = new Set<string>();
  for (const r of raws) {
    out.add(squash(r));
    out.add(squash(cutCollab(r)));
  }
  out.delete('');
  if (!out.size) out.add(title.trim().toLowerCase());
  return out;
}

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
  if (!title || !title.trim() || !answer) return false;
  const a = squash(answer) || answer.trim().toLowerCase();
  if (!a) return false;

  for (const t of candidates(title)) {
    // 1. точное совпадение (без учёта регистра, знаков и «x Артист» / «feat.» / «w/»)
    if (t === a) return true;

    // 2. опечатки — только в длинных названиях и с той же первой буквой
    const budget = typoBudget(t.length);
    if (
      budget > 0 &&
      a[0] === t[0] &&
      Math.abs(a.length - t.length) <= budget &&
      levenshtein(a, t) <= budget
    ) {
      return true;
    }

    // 3. несколько слов подряд, покрывающие почти всё название
    if (a.split(' ').length >= 2 && t.includes(a) && a.length >= t.length * 0.7) return true;
  }
  return false;
}
