import React from 'react';
import { Text } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import { createVisit, deleteVisit } from '../src/api/places';
import {
  dayOptions,
  defaultPick,
  isPast,
  planTime,
  PLAN_DAYS,
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

// A Monday morning, 9:30 local time.
const MONDAY_0930 = new Date(2026, 10, 9, 9, 30);

describe('plan times', () => {
  test('two weeks of days: Today, Tomorrow, then weekday and date', () => {
    const days = dayOptions(MONDAY_0930);
    expect(days).toHaveLength(PLAN_DAYS);
    expect(days.slice(0, 3).map(d => d.label)).toEqual([
      'Today',
      'Tomorrow',
      'Wed 11',
    ]);
  });

  test('a slot is a local date and time', () => {
    const when = planTime(MONDAY_0930, 2, 'afternoon');
    expect([when.getDate(), when.getHours(), when.getMinutes()]).toEqual([
      11, 15, 0,
    ]);
  });

  test('slots already over today are past; other days never are', () => {
    const eveningNow = new Date(2026, 10, 9, 13, 0);
    expect(isPast(eveningNow, 0, 'lunch')).toBe(true);
    expect(isPast(eveningNow, 0, 'afternoon')).toBe(false);
    expect(isPast(eveningNow, 1, 'morning')).toBe(false);
  });

  test('the default pick is the next slot still ahead, else tomorrow lunch', () => {
    expect(defaultPick(MONDAY_0930)).toEqual({ offset: 0, slotId: 'morning' });
    expect(defaultPick(new Date(2026, 10, 9, 16, 0))).toEqual({
      offset: 0,
      slotId: 'evening',
    });
    expect(defaultPick(new Date(2026, 10, 9, 21, 0))).toEqual({
      offset: 1,
      slotId: 'lunch',
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
      n
        .findAllByType(Text)
        .some(t => [t.props.children].flat().join('') === label),
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
  });

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

  test('adds a plan for the picked day and time', async () => {
    const onSaved = jest.fn();
    const tree = await sheet(null, onSaved);
    expect(allTexts(tree)).toContain('Plan a visit to 麺屋たいき');
    await press(tree, 'Tomorrow');
    await press(tree, 'Evening 18:00');
    await press(tree, 'Add to plans');
    expect(createMock).toHaveBeenCalledTimes(1);
    const [placeId, iso] = createMock.mock.calls[0];
    const when = new Date(iso);
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    expect(placeId).toBe('menya-taiki');
    expect([when.getDate(), when.getHours()]).toEqual([tomorrow.getDate(), 18]);
    expect(onSaved).toHaveBeenCalled();
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
    await press(tree, 'Tomorrow');
    await press(tree, 'Save change');
    expect(order).toEqual(['create', 'delete']);
  });

  test('a failed save keeps the old plan', async () => {
    createMock.mockRejectedValueOnce(new Error('offline'));
    const tree = await sheet(EXISTING);
    await press(tree, 'Change');
    await press(tree, 'Tomorrow');
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
