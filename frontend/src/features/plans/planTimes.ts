import { copy } from '../../copy';

/** How many days ahead a visit can be planned from the sheet. */
export const PLAN_DAYS = 14;

export type SlotId = 'morning' | 'lunch' | 'afternoon' | 'evening';

/** Times of day a visit can be planned for (local time). */
export const TIME_SLOTS: { id: SlotId; hour: number }[] = [
  { id: 'morning', hour: 10 },
  { id: 'lunch', hour: 12 },
  { id: 'afternoon', hour: 15 },
  { id: 'evening', hour: 18 },
];

export interface DayOption {
  /** Days from today: 0 = today. */
  offset: number;
  label: string;
}

/** Today, tomorrow, then "Wed 12" style labels, for the next PLAN_DAYS days. */
export function dayOptions(now: Date): DayOption[] {
  return Array.from({ length: PLAN_DAYS }, (_, offset) => {
    const day = new Date(now);
    day.setDate(day.getDate() + offset);
    const label =
      offset === 0
        ? copy.plans.today
        : offset === 1
        ? copy.plans.tomorrow
        : copy.plans.dayLabel(
            copy.common.weekdays[day.getDay()],
            day.getDate(),
          );
    return { offset, label };
  });
}

export function slotLabel(slot: { id: SlotId; hour: number }): string {
  return copy.plans.slotLabel(copy.plans.slots[slot.id], `${slot.hour}:00`);
}

/** The local date and time for a day offset and a time slot. */
export function planTime(now: Date, offset: number, slotId: SlotId): Date {
  const slot = TIME_SLOTS.find(s => s.id === slotId) ?? TIME_SLOTS[0];
  const when = new Date(now);
  when.setDate(when.getDate() + offset);
  when.setHours(slot.hour, 0, 0, 0);
  return when;
}

/** Slots already over today can't be picked. */
export function isPast(now: Date, offset: number, slotId: SlotId): boolean {
  return planTime(now, offset, slotId).getTime() <= now.getTime();
}

/** The next slot that is still ahead: later today, else tomorrow lunch. */
export function defaultPick(now: Date): { offset: number; slotId: SlotId } {
  const today = TIME_SLOTS.find(s => !isPast(now, 0, s.id));
  return today
    ? { offset: 0, slotId: today.id }
    : { offset: 1, slotId: 'lunch' };
}
