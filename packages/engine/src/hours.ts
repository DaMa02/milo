/**
 * OSM opening_hours: the common forms ("Mo-Fr 08:00-20:00; Sa 09:00-13:00", "24/7", split days and hours),
 * read into a week and checked against the local time. Anything else is "cannot read", never a guess.
 */
const DAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

export type Week = Map<number, [number, number][]>;

/**
 * Rules and the separator before each: ';' starts a rule that replaces earlier ones for its days, and
 * ", " between a time and a day ("08:00-20:00, Sa 09:00-13:00") adds a rule.
 */
function splitRules(s: string): { rules: string[]; seps: string[] } {
  const rules: string[] = [];
  const seps = [';'];
  let cur = '';
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === ';') {
      rules.push(cur.trim());
      seps.push(';');
      cur = '';
      continue;
    }
    if (ch === ',' && /\d/.test(s[i - 1] ?? '')) {
      let j = i + 1;
      while (j < s.length && /\s/.test(s[j])) j++;
      if (/[A-Z]/.test(s[j] ?? '')) {
        rules.push(cur.trim());
        seps.push(s.slice(i, j));
        cur = '';
        i = j - 1;
        continue;
      }
    }
    cur += ch;
  }
  rules.push(cur.trim());
  return { rules, seps };
}

/** {weekday 0-6 (Monday 0): [[open minute, close minute]]}; null when it cannot be read. */
export function parseHours(s: string | undefined | null): Week | null {
  if (typeof s !== 'string' || !s.trim()) return null;
  if (s.trim() === '24/7') return new Map(DAYS.map((_, d) => [d, [[0, 1440]]]));
  const week: Week = new Map();
  const { rules, seps } = splitRules(s);
  for (let k = 0; k < rules.length; k++) {
    const rule = rules[k].replace(/\b[PS]H,|,[PS]H\b/g, ''); // public/school holidays: not said
    const sep = seps[k];
    if (!rule || ['PH', 'SH'].includes(rule.trim().split(/\s+/)[0])) continue;
    const m = /^([A-Z][a-z](?:-[A-Z][a-z])?(?:,[A-Z][a-z](?:-[A-Z][a-z])?)*)?\s*(.*)$/s.exec(rule);
    if (!m) return null;
    const days = new Set<number>();
    for (const part of (m[1] ?? 'Mo-Su').split(',')) {
      const dash = part.indexOf('-');
      const a = dash < 0 ? part : part.slice(0, dash);
      const b = dash < 0 ? '' : part.slice(dash + 1);
      if (!DAYS.includes(a) || (b && !DAYS.includes(b))) return null;
      const i = DAYS.indexOf(a);
      const j = DAYS.indexOf(b || a);
      for (let d = 0; d <= (((j - i) % 7) + 7) % 7; d++) days.add((i + d) % 7);
    }
    const spans: [number, number][] = [];
    const t = m[2].trim();
    if (t !== 'off' && t !== 'closed') {
      for (const piece of t.split(',')) {
        const hm = /^(\d\d?):(\d\d)\s*-\s*(\d\d?):(\d\d)$/.exec(piece.trim());
        if (!hm) return null;
        const [h1, m1, h2, m2] = hm.slice(1).map(Number);
        if (Math.max(h1, h2) > 24 || Math.max(m1, m2) > 59) return null;
        const a = h1 * 60 + m1;
        const b = h2 * 60 + m2;
        spans.push([a, b > a ? b : b + 1440]);
      }
    }
    // a later ';' rule replaces an earlier one for its days, a ',' rule adds to it
    for (const d of days) week.set(d, sep === ';' ? [...spans] : [...(week.get(d) ?? []), ...spans]);
  }
  return week.size ? week : null;
}

/** Weekday (Monday 0) and minutes after midnight of `now` in a time zone (the device's when none is given). */
export function localTime(now: Date, timeZone?: string): { day: number; minute: number } {
  if (timeZone) {
    try {
      const f = new Intl.DateTimeFormat('en-GB', { timeZone, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
      const parts = Object.fromEntries(f.formatToParts(now).map((p) => [p.type, p.value]));
      const day = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(parts.weekday);
      if (day >= 0) return { day, minute: Number(parts.hour) * 60 + Number(parts.minute) };
    } catch {
      // no time zone data: the device's local time below
    }
  }
  return { day: (now.getDay() + 6) % 7, minute: now.getHours() * 60 + now.getMinutes() };
}

export type HoursState =
  | { kind: 'always' }
  | { kind: 'open_until'; hm: string }
  | { kind: 'opens'; when: 'today' | 'tomorrow' | number; hm: string }
  | { kind: 'closed' };

const hm = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

/** Open now or not, and when it next opens or closes; null when the hours cannot be read. */
export function hoursNow(raw: string | undefined | null, now: Date, timeZone?: string): [boolean | null, HoursState | null] {
  const week = parseHours(raw);
  if (!week) return [null, null];
  const { day: d, minute: t } = localTime(now, timeZone);
  if ([0, 1, 2, 3, 4, 5, 6].every((i) => JSON.stringify(week.get(i)) === JSON.stringify([[0, 1440]]))) return [true, { kind: 'always' }];
  const today = [...(week.get(d) ?? []), ...(week.get((d + 6) % 7) ?? []).map(([a, b]) => [a - 1440, b - 1440] as [number, number])];
  for (const [a, b] of today) if (a <= t && t < b) return [true, { kind: 'open_until', hm: hm(b) }];
  for (let k = 0; k < 8; k++) {
    const later = (week.get((d + k) % 7) ?? []).map(([a]) => a).filter((a) => k || a > t).sort((x, y) => x - y);
    if (later.length) return [false, { kind: 'opens', when: k === 0 ? 'today' : k === 1 ? 'tomorrow' : (d + k) % 7, hm: hm(later[0]) }];
  }
  return [false, { kind: 'closed' }];
}
