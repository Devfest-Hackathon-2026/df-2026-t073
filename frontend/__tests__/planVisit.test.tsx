import React from 'react';
import { Text } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import { createVisit, deleteVisit } from '../src/api/places';
import {
  defaultPick,
  fromDate,
  isPast,
  isPastDay,
  monthWeeks,
  pickLabel,
  stepHour,
  stepMinute,
  toDate,
} from '../src/features/plans/planTimes';
import { PlanVisitSheet } from '../src/features/plans/PlanVisitSheet';
import { PrepareScreen } from '../src/screens/prepare/PrepareScreen';
import { SettingsProvider } from '../src/state/SettingsContext';
import type { RootScreenProps } from '../src/navigation/types';
import type { Visit } from '../src/types';

jest.mock('../src/api/places', () => ({
  ...jest.requireActual('../src/api/places'),
  createVisit: jest.fn(async () => ({})),
  deleteVisit: jest.fn(async () => undefined),
}));

const createMock = createVisit as jest.MockedFunction<typeof createVisit>;
const deleteMock = deleteVisit as jest.MockedFunction<typeof deleteVisit>;

// A Monday morning, 9:30 local time: 9 November 2026.
const MONDAY_0930 = new Date(2026, 10, 9, 9, 30);

describe('plan times', () => {
  test('November 2026 as calendar weeks, Sunday first', () => {
    const weeks = monthWeeks(2026, 10);
    expect(weeks[0]).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(weeks).toHaveLength(5);
    expect(weeks[4]).toEqual([29, 30, null, null, null, null, null]);
  });

  test('days before today are past; today is not', () => {
    expect(isPastDay(MONDAY_0930, 2026, 10, 8)).toBe(true);
    expect(isPastDay(MONDAY_0930, 2026, 10, 9)).toBe(false);
  });

  test('times earlier today are past', () => {
    const today = fromDate(MONDAY_0930);
    expect(isPast(MONDAY_0930, { ...today, hour: 9, minute: 15 })).toBe(true);
    expect(isPast(MONDAY_0930, { ...today, hour: 12, minute: 15 })).toBe(false);
  });

  test('hours and minutes step and wrap; minutes move by 5', () => {
    const pick = { ...fromDate(MONDAY_0930), hour: 23, minute: 55 };
    expect(stepHour(pick, 1).hour).toBe(0);
    expect(stepMinute(pick, 1).minute).toBe(0);
    expect(stepMinute({ ...pick, minute: 0 }, -1).minute).toBe(55);
    expect(stepMinute({ ...pick, minute: 10 }, 1).minute).toBe(15);
  });

  test('a pick is a local date and time, e.g. 12:15', () => {
    const pick = { year: 2026, month: 10, date: 12, hour: 12, minute: 15 };
    const when = toDate(pick);
    expect([when.getDate(), when.getHours(), when.getMinutes()]).toEqual([
      12, 12, 15,
    ]);
    expect(pickLabel(pick)).toBe('Thu 12 Nov, 12:15');
  });

  test('the default pick is the next quick pick still ahead, else tomorrow lunch', () => {
    expect(defaultPick(MONDAY_0930)).toMatchObject({ date: 9, hour: 10 });
    expect(defaultPick(new Date(2026, 10, 9, 16, 0))).toMatchObject({
      date: 9,
      hour: 18,
    });
    expect(defaultPick(new Date(2026, 10, 9, 21, 0))).toMatchObject({
      date: 10,
      hour: 12,
      minute: 0,
    });
  });
});

async function render(node: React.ReactElement) {
  let tree!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    tree = ReactTestRenderer.create(
      <SettingsProvider>{node}</SettingsProvider>,
    );
  });
  return tree;
}

const allTexts = (tree: ReactTestRenderer.ReactTestRenderer) =>
  tree.root
    .findAllByType(Text)
    .map(n => [n.props.children].flat().join(''))
    .join(' | ');

async function press(tree: ReactTestRenderer.ReactTestRenderer, label: string) {
  const target = tree.root.findAll(
    n =>
      typeof n.props.onPress === 'function' &&
      (n.props.accessibilityLabel === label ||
        n
          .findAllByType(Text)
          .some(t => [t.props.children].flat().join('') === label)),
  )[0];
  expect(target).toBeDefined();
  await ReactTestRenderer.act(async () => {
    target!.props.onPress();
  });
}

const EXISTING: Visit = {
  id: 'visit-1',
  place: {
    id: 'menya-taiki',
    name: { text: '麺屋たいき' },
    category: 'Ramen',
    area: 'Koenji',
    lat: 0,
    lng: 0,
  },
  when: new Date(2026, 10, 12, 12, 0).toISOString(),
  tangoCount: 0,
};

describe('PlanVisitSheet', () => {
  beforeEach(() => {
    createMock.mockClear();
    deleteMock.mockClear();
    jest.useFakeTimers({ now: MONDAY_0930 });
  });
  afterEach(() => jest.useRealTimers());

  const sheet = (existing: Visit | null, onSaved = jest.fn()) =>
    render(
      <PlanVisitSheet
        visible
        onClose={() => {}}
        place={{ id: 'menya-taiki', name: '麺屋たいき' }}
        visits={existing ? [existing] : []}
        onSaved={onSaved}
      />,
    );

  test('adds a plan for any picked date and time, e.g. 12:15', async () => {
    const onSaved = jest.fn();
    const tree = await sheet(null, onSaved);
    expect(allTexts(tree)).toContain('Plan a visit to 麺屋たいき');
    expect(allTexts(tree)).toContain('November 2026');
    await press(tree, 'Thu 12 November');
    await press(tree, 'Lunch 12:00');
    for (let i = 0; i < 3; i++) {
      await press(tree, 'Later minute');
    }
    expect(allTexts(tree)).toContain('Thu 12 Nov, 12:15');
    await press(tree, 'Add to plans');
    expect(createMock).toHaveBeenCalledTimes(1);
    const [placeId, iso] = createMock.mock.calls[0];
    const when = new Date(iso);
    expect(placeId).toBe('menya-taiki');
    expect([when.getDate(), when.getHours(), when.getMinutes()]).toEqual([
      12, 12, 15,
    ]);
    expect(onSaved).toHaveBeenCalled();
  });

  test('later months are a tap away; past days and times cannot be saved', async () => {
    const tree = await sheet(null);
    await press(tree, 'Next month');
    expect(allTexts(tree)).toContain('December 2026');
    await press(tree, 'Previous month');
    const past = tree.root.findAll(
      n => n.props.accessibilityLabel === 'Sun 8 November',
    )[0];
    expect(past!.props.disabled).toBe(true);
    // Today at 8:00 is already over (the default is 10:00).
    await press(tree, 'Earlier hour');
    await press(tree, 'Earlier hour');
    expect(allTexts(tree)).toContain('Mon 9 Nov, 8:00');
    expect(allTexts(tree)).toContain('Pick a time later than now.');
  });

  test('an existing plan shows Change and Remove', async () => {
    const tree = await sheet(EXISTING);
    expect(allTexts(tree)).toContain('Planned');
    expect(allTexts(tree)).toContain('Thu 12:00');
    await press(tree, 'Remove');
    expect(deleteMock).toHaveBeenCalledWith('visit-1');
    expect(createMock).not.toHaveBeenCalled();
  });

  test('changing a plan adds the new one before removing the old one', async () => {
    const order: string[] = [];
    createMock.mockImplementationOnce(async () => {
      order.push('create');
      return EXISTING;
    });
    deleteMock.mockImplementationOnce(async () => {
      order.push('delete');
    });
    const tree = await sheet(EXISTING);
    await press(tree, 'Change');
    // Changing starts from the plan's own date and time.
    expect(allTexts(tree)).toContain('Thu 12 Nov, 12:00');
    await press(tree, 'Fri 13 November');
    await press(tree, 'Save change');
    expect(order).toEqual(['create', 'delete']);
  });

  test('a failed save keeps the old plan', async () => {
    createMock.mockRejectedValueOnce(new Error('offline'));
    const tree = await sheet(EXISTING);
    await press(tree, 'Change');
    await press(tree, 'Fri 13 November');
    await press(tree, 'Save change');
    expect(deleteMock).not.toHaveBeenCalled();
    expect(allTexts(tree)).toContain('offline');
  });
});

describe('Prepare screen', () => {
  type Props = RootScreenProps<'Prepare'>;
  // The mock briefing and lists answer after a short delay.
  // Screens rendered in a test; unmounted afterwards so no timers outlive it.
  const mounted: ReactTestRenderer.ReactTestRenderer[] = [];
  beforeEach(() => jest.useFakeTimers());
  afterEach(async () => {
    for (const tree of mounted.splice(0)) {
      await ReactTestRenderer.act(async () => tree.unmount());
    }
    jest.useRealTimers();
  });

  const prepare = async (placeId: string) => {
    const tree = await renderScreen(placeId);
    mounted.push(tree);
    for (let i = 0; i < 3; i++) {
      await ReactTestRenderer.act(async () => {
        jest.advanceTimersByTime(1000);
      });
    }
    return tree;
  };
  const renderScreen = (placeId: string) =>
    render(
      <PrepareScreen
        navigation={
          {
            goBack: jest.fn(),
            navigate: jest.fn(),
          } as unknown as Props['navigation']
        }
        route={
          {
            key: 'Prepare',
            name: 'Prepare',
            params: { placeId },
          } as unknown as Props['route']
        }
      />,
    );

  test('the tips card is "Learner tips", without the side caption', async () => {
    const tree = await prepare('menya-taiki');
    expect(allTexts(tree)).toContain('Learner tips');
    expect(allTexts(tree)).not.toContain('History here');
    expect(allTexts(tree)).not.toContain('Your first visit');
  });

  test('first time at a place: a note under the tips header', async () => {
    const first = await prepare('nakano-ward-office');
    expect(allTexts(first)).toContain(
      "It's your first time here. Give it a try!",
    );
    const again = await prepare('menya-taiki');
    expect(allTexts(again)).not.toContain("It's your first time here");
  });

  test('the header heart favourites the place', async () => {
    const tree = await prepare('asagaya-pearl');
    const heart = () =>
      tree.root.findAll(
        n =>
          typeof n.props.accessibilityLabel === 'string' &&
          /favourite/i.test(n.props.accessibilityLabel) &&
          typeof n.props.onPress === 'function',
      )[0];
    expect(heart().props.accessibilityLabel).toMatch(/^Favourite /);
    await ReactTestRenderer.act(async () => {
      heart().props.onPress();
    });
    expect(heart().props.accessibilityLabel).toMatch(/from favourites$/);
  });

  test('without a plan: "Not planned" and a button that opens the sheet', async () => {
    const tree = await prepare('asagaya-pearl');
    expect(allTexts(tree)).toContain('Not planned');
    await press(tree, 'Plan a visit');
    expect(allTexts(tree)).toContain('Plan a visit to');
  });

  test('with a plan: its day and time, and Change', async () => {
    const tree = await prepare('nakano-ward-office');
    expect(allTexts(tree)).toContain('Planned');
    await press(tree, 'Change');
    expect(allTexts(tree)).toContain('Remove');
  });
});
