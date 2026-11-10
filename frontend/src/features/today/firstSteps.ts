/** Tango to catch for the first Getting started step. */
export const FIRST_CATCH = 3;
/** How many Getting started steps there are. */
export const FIRST_STEPS = 3;

export interface FirstStepsProgress {
  /** Tango caught so far, up to FIRST_CATCH. */
  caught: number;
  catchDone: boolean;
  planDone: boolean;
  rehearseDone: boolean;
  doneCount: number;
  allDone: boolean;
}

/** How far the user is through the Getting started steps. */
export function firstStepsProgress({
  totalTango,
  hasPlan,
  rehearsed,
}: {
  totalTango: number;
  hasPlan: boolean;
  rehearsed: boolean;
}): FirstStepsProgress {
  const caught = Math.min(FIRST_CATCH, Math.max(0, totalTango));
  const catchDone = caught >= FIRST_CATCH;
  const done = [catchDone, hasPlan, rehearsed];
  const doneCount = done.filter(Boolean).length;
  return {
    caught,
    catchDone,
    planDone: hasPlan,
    rehearseDone: rehearsed,
    doneCount,
    allDone: doneCount === done.length,
  };
}
