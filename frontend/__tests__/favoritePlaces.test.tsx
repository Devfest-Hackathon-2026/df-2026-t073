import React from 'react';
import { Text } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import {
  addFavoritePlace,
  getToday,
  listFavoritePlaces,
  removeFavoritePlace,
} from '../src/api/places';
import {
  type FavoritePlaces,
  useFavoritePlaces,
} from '../src/features/places/useFavoritePlaces';
import { MapScreen } from '../src/screens/map/MapScreen';
import { SettingsProvider } from '../src/state/SettingsContext';
import type { MapPin, Place, TodaySummary } from '../src/types';

const TAIKI: Place = {
  id: 'menya-taiki',
  name: { text: '麺屋たいき' },
  category: 'Ramen',
  area: 'Koenji',
  lat: 35.7,
  lng: 139.65,
};

jest.mock('../src/api/places', () => ({
  ...jest.requireActual('../src/api/places'),
  listFavoritePlaces: jest.fn(async () => []),
  addFavoritePlace: jest.fn(async () => undefined),
  removeFavoritePlace: jest.fn(async () => undefined),
  getToday: jest.fn(),
}));
const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({ navigate: mockNavigate, goBack: jest.fn() }),
  useIsFocused: () => true,
}));

const listMock = listFavoritePlaces as jest.MockedFunction<
  typeof listFavoritePlaces
>;
const addMock = addFavoritePlace as jest.MockedFunction<
  typeof addFavoritePlace
>;
const removeMock = removeFavoritePlace as jest.MockedFunction<
  typeof removeFavoritePlace
>;
const todayMock = getToday as jest.MockedFunction<typeof getToday>;

async function render(node: React.ReactElement) {
  let tree!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    tree = ReactTestRenderer.create(
      <SettingsProvider>{node}</SettingsProvider>,
    );
  });
  return tree;
}

const texts = (tree: ReactTestRenderer.ReactTestRenderer) =>
  tree.root.findAllByType(Text).map(n => [n.props.children].flat().join(''));

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

beforeEach(() => {
  listMock.mockReset();
  listMock.mockResolvedValue([]);
  addMock.mockReset();
  addMock.mockResolvedValue(undefined);
  removeMock.mockReset();
  removeMock.mockResolvedValue(undefined);
  mockNavigate.mockClear();
});

describe('useFavoritePlaces', () => {
  let favorites!: FavoritePlaces;
  function Probe(): null {
    favorites = useFavoritePlaces();
    return null;
  }

  test('starts from the saved favorites', async () => {
    listMock.mockResolvedValue([TAIKI]);
    await render(<Probe />);
    expect(favorites.isFavorite('menya-taiki')).toBe(true);
    expect(favorites.isFavorite('other')).toBe(false);
  });

  test('toggling shows right away and saves', async () => {
    await render(<Probe />);
    await ReactTestRenderer.act(async () => favorites.toggle('menya-taiki'));
    expect(favorites.isFavorite('menya-taiki')).toBe(true);
    expect(addMock).toHaveBeenCalledWith('menya-taiki');
    await ReactTestRenderer.act(async () => favorites.toggle('menya-taiki'));
    expect(favorites.isFavorite('menya-taiki')).toBe(false);
    expect(removeMock).toHaveBeenCalledWith('menya-taiki');
  });

  test('a failed save is undone', async () => {
    addMock.mockRejectedValueOnce(new Error('offline'));
    await render(<Probe />);
    await ReactTestRenderer.act(async () => favorites.toggle('menya-taiki'));
    expect(favorites.isFavorite('menya-taiki')).toBe(false);
  });
});

describe('Map favorites', () => {
  // The Map keeps timers and a location lookup running; stop them after each test.
  let mounted: ReactTestRenderer.ReactTestRenderer | null = null;
  afterEach(async () => {
    const tree = mounted;
    mounted = null;
    if (tree) {
      await ReactTestRenderer.act(async () => tree.unmount());
    }
  });
  const pin = (overrides: Partial<MapPin>): MapPin => ({
    id: 'p',
    label: '',
    count: 0,
    x: 0.5,
    y: 0.5,
    lat: 35.7,
    lng: 139.65,
    kind: 'tango',
    ...overrides,
  });
  const summary: TodaySummary = {
    userName: 'Ari',
    upNext: null,
    pins: [
      pin({ id: 'pin-koenji', label: 'Koenji', count: 3, areaId: 'koenji' }),
      pin({
        id: 'fav-menya-taiki',
        label: '麺屋たいき',
        kind: 'favorite',
        placeId: 'menya-taiki',
      }),
    ],
    areas: [],
    starterTango: [],
    wordOfDay: null,
  };

  const map = async () => {
    todayMock.mockResolvedValue(summary);
    const tree = await render(
      <MapScreen
        {...({ route: { params: {} } } as unknown as React.ComponentProps<
          typeof MapScreen
        >)}
      />,
    );
    mounted = tree;
    return tree;
  };

  test('favorite pins show only under the Favorites filter', async () => {
    const tree = await map();
    expect(texts(tree)).toContain('Koenji');
    expect(texts(tree)).not.toContain('麺屋たいき');
    await press(tree, 'Favorites');
    expect(texts(tree)).toContain('麺屋たいき');
    expect(texts(tree)).not.toContain('Koenji');
  });

  test('tapping a favorite pin opens Prepare for that place', async () => {
    const tree = await map();
    await press(tree, 'Favorites');
    const marker = tree.root.findAll(
      n =>
        typeof n.props.onPress === 'function' &&
        n.findAllByType(Text).some(t => t.props.children === '麺屋たいき'),
    )[0];
    await ReactTestRenderer.act(async () => marker!.props.onPress());
    expect(mockNavigate).toHaveBeenCalledWith('Prepare', {
      placeId: 'menya-taiki',
    });
  });
});
