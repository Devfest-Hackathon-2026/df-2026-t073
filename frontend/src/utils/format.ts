import { copy } from '../copy';
export function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** "Sun 12:15" style label for a visit time, in the device's time zone. */
export function formatVisitTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return `${copy.common.weekdays[date.getDay()]} ${pad(date.getHours())}:${pad(
    date.getMinutes(),
  )}`;
}

/** Puts the user's preferred register ("Phrases shown first") at the top. */
export function orderExamples<T extends { register: 'easy' | 'keigo' }>(
  examples: T[],
  first: 'easy' | 'keigo',
): T[] {
  return [...examples].sort(
    (a, b) => Number(b.register === first) - Number(a.register === first),
  );
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * How long until a time, roughly: "25 minutes", "3 hours", "2 days".
 * Null once it has passed (or can't be read).
 */
export function formatTimeUntil(
  iso: string,
  now: number = Date.now(),
): string | null {
  const ms = Date.parse(iso) - now;
  if (!Number.isFinite(ms) || ms <= 0) {
    return null;
  }
  const count = (n: number, one: string, many: string) =>
    n === 1 ? one : `${n} ${many}`;
  if (ms < HOUR) {
    return count(Math.max(1, Math.ceil(ms / MINUTE)), 'a minute', 'minutes');
  }
  if (ms < DAY) {
    return count(Math.round(ms / HOUR), 'an hour', 'hours');
  }
  return count(Math.round(ms / DAY), 'a day', 'days');
}
