const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** "Sun 12:15" style label for a visit time, in the device's time zone. */
export function formatVisitTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return `${DAYS[date.getDay()]} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
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
