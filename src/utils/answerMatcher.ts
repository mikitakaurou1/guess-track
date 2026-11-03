const COLLAB = new Set(['x', '\u0445', '\u00d7', 'feat', 'feat.', 'ft', 'ft.', 'featuring', 'w/', 'vs', 'vs.', 'prod', 'prod.']);

// Кириллические буквы, неотличимые от латинских, приводим к латинским.
// Так «папа» с латинскими a в названии трека и обычный ответ «папа» считаются одним и тем же.
const SHAPE: Record<string, string> = {
  '\u0430': 'a',
  '\u0441': 'c',
  '\u0435': 'e',
  '\u043e': 'o',
  '\u0440': 'p',
  '\u0445': 'x',
  '\u0443': 'y',
  '\u043a': 'k',
  '\u043c': 'm',
  '\u0442': 't',
  '\u043d': 'h',
  '\u0432': 'b',
};

// Цифры внутри слов, похожие на буквы: Dha6y -> dhaby
const LEET: Record<string, string> = {
  '0': 'o',
  '3': 'e',
  '4': 'a',
  '5': 's',
  '6': 'b',
  '7': 't',
  '8': 'b',
  '9': 'g',
};

// Допустимое число опечаток по длине названия (с учётом пробелов). Верните 0, чтобы опечатки не прощались.
function typoBudget(len: number): number {
  if (len < 7) return 0;
  if (len < 11) return 1;
  if (len < 16) return 2;
  return 3;
}

// Приводим строку к «скелету»: без регистра, диакритики (й, ё), невидимых символов и знаков
function squash(s: string): string {
  const base = s.toLowerCase().normalize('NFKD').replace(/[\p{M}\p{Cf}]/gu, '');
  return base
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .map((tok) => {
      const shaped = [...tok].map((ch) => SHAPE[ch] ?? ch).join('');
      return /\p{L}/u.test(shaped) ? [...shaped].map((ch) => LEET[ch] ?? ch).join('') : shaped;
    })
    .join(' ');
}

function stripBrackets(s: string): string {
  return s.replace(/\([^)]*\)|\[[^\]]*\]/g, ' ');
}

function splitParts(s: string): string[] {
  let parts = [s];
  for (const sep of [' - ', ' \u2013 ', ' \u2014 ', ' | ', ' \u2022 ']) {
    parts = parts.flatMap((p) => p.split(sep));
  }
  return parts;
}

// «LIPSTICK x 9mice» -> «LIPSTICK», «ПАПА +tewiq, ...» -> «ПАПА», «Название w/ Кто-то» -> «Название»
function cutCollab(raw: string): string {
  const tokens = raw.trim().split(' ').filter(Boolean);
  for (let i = 1; i < tokens.length; i++) {
    const low = tokens[i].toLowerCase();
    if (COLLAB.has(low) || low.startsWith('+')) return tokens.slice(0, i).join(' ');
  }
  return raw;
}

function candidates(title: string): Set<string> {
  const base = stripBrackets(title);
  const raws = [base];
  const parts = splitParts(base).map((p) => p.trim()).filter(Boolean);
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
    // 1. точное совпадение «скелетов» (без регистра, знаков, «x Артист» / «+ Артист» / «feat.» / «w/»)
    if (t === a) return true;

    // 2. небольшие опечатки в длинных названиях с той же первой буквой
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
