import React from 'react';
import { Text, TextInput } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import { createVisit, searchPlaces } from '../src/api/places';
import { PlaceSearchResults } from '../src/components/PlaceSearchResults';
import { PlanVisitSheet } from '../src/features/plans/PlanVisitSheet';
import { TodayScreen } from '../src/screens/today/TodayScreen';
import { SettingsProvider } from '../src/state/SettingsContext';
import type { Place } from '../src/types';

const PLACE: Place = {
  id: 'nakano-ward-office',
  name: { text: '中野区役所', meaning: 'Nakano Ward Office' },
  category: 'Ward office',
  area: 'Nakano',
  lat: 0,
  lng: 0,
};

jest.mock('../src/api/places', () => ({
  ...jest.requireActual('../src/api/places'),
  searchPlaces: jest.fn(async () => []),
  createVisit: jest.fn(async () => ({})),
}));
const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({ navigate: mockNavigate, goBack: jest.fn() }),
  useIsFocused: () => true,
}));

const searchMock = searchPlaces as jest.MockedFunction<typeof searchPlaces>;
const createMock = createVisit as jest.MockedFunction<typeof createVisit>;

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

/** Search delay in useDebouncedValue, plus a little slack. */
const SEARCH_WAIT_MS = 350;

async function search(tree: ReactTestRenderer.ReactTestRenderer, q: string) {
  await ReactTestRenderer.act(async () => {
    tree.root.findByType(TextInput).props.onChangeText(q);
  });
  // Place search waits for typing to pause before it runs.
  await ReactTestRenderer.act(async () => {
    // Jest's modern fake timers put a `clock` on setTimeout.
    if ('clock' in setTimeout) {
      jest.advanceTimersByTime(SEARCH_WAIT_MS);
    } else {
      await new Promise<void>(resolve => setTimeout(resolve, SEARCH_WAIT_MS));
    }
  });
}

beforeEach(() => {
  searchMock.mockReset();
  searchMock.mockResolvedValue([PLACE]);
  createMock.mockClear();
});

test('PlaceSearchResults hands the picked place to the caller', async () => {
  const onPick = jest.fn();
  const tree = await render(
    <PlaceSearchResults places={[PLACE]} loading={false} onPick={onPick} />,
  );
  await press(tree, '中野区役所');
  expect(onPick).toHaveBeenCalledWith(PLACE);
});

describe('plan sheet without a place', () => {
  const open = () =>
    render(
      <PlanVisitSheet
        visible
        onClose={() => {}}
        visits={[]}
        onSaved={jest.fn()}
      />,
    );

  test('starts with a search, then plans for the picked place', async () => {
    const tree = await open();
    expect(allTexts(tree)).toContain('Plan a visit');
    await search(tree, 'nakano');
    await press(tree, '中野区役所');
    expect(allTexts(tree)).toContain('Plan a visit to 中野区役所');
    // The default date and time is always still ahead.
    await press(tree, 'Add to plans');
    expect(createMock.mock.calls[0][0]).toBe('nakano-ward-office');
  });

  test('"Pick another place" goes back to the search', async () => {
    const tree = await open();
    await search(tree, 'nakano');
    await press(tree, '中野区役所');
    await press(tree, 'Pick another place');
    expect(tree.root.findAllByType(TextInput)).toHaveLength(1);
    expect(allTexts(tree)).not.toContain('Plan a visit to');
  });
});

describe('Today', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test('"Plan a visit" opens the plan sheet with a place search', async () => {
    const tree = await render(<TodayScreen />);
    for (let i = 0; i < 3; i++) {
      await ReactTestRenderer.act(async () => {
        jest.advanceTimersByTime(1000);
      });
    }
    await press(tree, 'Plan a visit');
    expect(tree.root.findAllByType(TextInput).length).toBeGreaterThan(0);
    await search(tree, 'nakano');
    await press(tree, '中野区役所');
    expect(allTexts(tree)).toContain('Plan a visit to 中野区役所');
  });
});
