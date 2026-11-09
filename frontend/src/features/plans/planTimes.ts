import { copy } from '../../copy';
import { pad } from '../../utils/format';

/** Minutes move in steps of this size. */
export const MINUTE_STEP = 5;

export type SlotId = 'morning' | 'lunch' | 'afternoon' | 'evening';

/** Quick picks for common times of day (local time). */
export const TIME_SLOTS: { id: SlotId; hour: number }[] = [
  { id: 'morning', hour: 10 },
  { id: 'lunch', hour: 12 },
  { id: 'afternoon', hour: 15 },
  { id: 'evening', hour: 18 },
];

/** A picked local date and time. `month` is 0-based, as in Date. */
export interface PlanPick {
  year: number;
  month: number;
  date: number;
  hour: number;
  minute: number;
}

export function toDate(pick: PlanPick): Date {
  return new Date(pick.year, pick.month, pick.date, pick.hour, pick.minute);
}

/** The pick for a date, with minutes rounded down to a MINUTE_STEP. */
export function fromDate(when: Date): PlanPick {
  return {
    year: when.getFullYear(),
    month: when.getMonth(),
    date: when.getDate(),
    hour: when.getHours(),
    minute: Math.floor(when.getMinutes() / MINUTE_STEP) * MINUTE_STEP,
  };
}

export function isPast(now: Date, pick: PlanPick): boolean {
  return toDate(pick).getTime() <= now.getTime();
}

/** Days before today can't be picked. */
export function isPastDay(
  now: Date,
  year: number,
  month: number,
  date: number,
): boolean {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return new Date(year, month, date).getTime() < today.getTime();
}

/** The next quick-pick time still ahead today, else tomorrow at lunch. */
export function defaultPick(now: Date): PlanPick {
  const today = fromDate(now);
  const slot = TIME_SLOTS.find(
    s => !isPast(now, { ...today, hour: s.hour, minute: 0 }),
  );
  if (slot) {
    return { ...today, hour: slot.hour, minute: 0 };
  }
  const tomorrow = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + 1,
  );
  return { ...fromDate(tomorrow), hour: 12, minute: 0 };
}

/**
 * The days of a month as calendar weeks, Sunday first. Blank cells before
 * the 1st and after the last day are null.
 */
export function monthWeeks(year: number, month: number): (number | null)[][] {
  const lead = new Date(year, month, 1).getDay();
  const days = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array<null>(lead).fill(null),
    ...Array.from({ length: days }, (_, i) => i + 1),
  ];
  while (cells.length % 7) {
    cells.push(null);
  }
  return Array.from({ length: cells.length / 7 }, (_, w) =>
    cells.slice(w * 7, w * 7 + 7),
  );
}

/** The month `delta` months from the given one. */
export function addMonths(
  year: number,
  month: number,
  delta: number,
): { year: number; month: number } {
  const moved = new Date(year, month + delta, 1);
  return { year: moved.getFullYear(), month: moved.getMonth() };
}

/** Moves the hour, wrapping around midnight. */
export function stepHour(pick: PlanPick, delta: number): PlanPick {
  return { ...pick, hour: (pick.hour + delta + 24) % 24 };
}

/** Moves the minutes by MINUTE_STEP, wrapping within the hour. */
export function stepMinute(pick: PlanPick, delta: number): PlanPick {
  return { ...pick, minute: (pick.minute + delta * MINUTE_STEP + 60) % 60 };
}

export function timeLabel(hour: number, minute: number): string {
  return `${hour}:${pad(minute)}`;
}

export function slotLabel(slot: { id: SlotId; hour: number }): string {
  return copy.plans.slotLabel(
    copy.plans.slots[slot.id],
    timeLabel(slot.hour, 0),
  );
}

/** e.g. "Thu 12 Nov, 12:15". */
export function pickLabel(pick: PlanPick): string {
  return copy.plans.pickLabel(
    copy.common.weekdays[toDate(pick).getDay()],
    pick.date,
    copy.common.months[pick.month],
    timeLabel(pick.hour, pick.minute),
  );
}
