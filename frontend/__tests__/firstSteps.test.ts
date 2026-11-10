import { firstStepsProgress } from '../src/features/today/firstSteps';

test('a new user has nothing done', () => {
  const p = firstStepsProgress({
    totalTango: 0,
    hasPlan: false,
    rehearsed: false,
  });
  expect(p).toMatchObject({
    caught: 0,
    catchDone: false,
    doneCount: 0,
    allDone: false,
  });
});

test('catching counts up to 3, then the step is done', () => {
  expect(
    firstStepsProgress({ totalTango: 2, hasPlan: false, rehearsed: false }),
  ).toMatchObject({ caught: 2, catchDone: false });
  expect(
    firstStepsProgress({ totalTango: 12, hasPlan: false, rehearsed: false }),
  ).toMatchObject({ caught: 3, catchDone: true, doneCount: 1 });
});

test('all three steps done', () => {
  expect(
    firstStepsProgress({ totalTango: 3, hasPlan: true, rehearsed: true }),
  ).toMatchObject({ doneCount: 3, allDone: true });
});
