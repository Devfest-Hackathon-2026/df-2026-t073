// Changes must clear the cached screens that show them, or tabs that stay
// open (Home, My Tango, Me) keep showing old data for minutes.
import { request } from '../src/api/client';
import { addFavoritePlace, removeFavoritePlace } from '../src/api/places';
import { submitAnswer } from '../src/api/review';
import { updateProfile } from '../src/api/user';
import { clearCache } from '../src/cache/storage';

jest.mock('../src/api/client', () => ({
  ...jest.requireActual('../src/api/client'),
  pick: (_area: string, _mock: unknown, real: unknown) => real,
  request: jest.fn(),
}));
jest.mock('../src/cache/storage', () => ({
  ...jest.requireActual('../src/cache/storage'),
  clearCache: jest.fn().mockResolvedValue(undefined),
}));

const requestMock = request as jest.MockedFunction<typeof request>;
const clearMock = clearCache as jest.MockedFunction<typeof clearCache>;
const cleared = () => clearMock.mock.calls.map(([prefix]) => prefix);

beforeEach(() => {
  requestMock.mockReset();
  clearMock.mockClear();
});

test('answering a review refreshes Home and My Tango', async () => {
  requestMock.mockResolvedValueOnce({
    exercise_id: 'ex-1',
    correct: true,
    stale: false,
  });
  await submitAnswer('rs_1', 'ex-1', { kind: 'flip', rating: 'good' });
  expect(cleared()).toEqual(
    expect.arrayContaining(['review:', 'tango:', 'today:']),
  );
});

test('editing the profile refreshes Me and the Home greeting', async () => {
  requestMock.mockResolvedValueOnce({
    name: 'Ari',
    reading_level: 'kana',
    home_area: null,
  });
  await updateProfile({ name: 'Ari' }).catch(() => {});
  expect(cleared()).toEqual(expect.arrayContaining(['user:', 'today:']));
});

test('favoriting a place refreshes Home map pins', async () => {
  requestMock.mockResolvedValue({});
  await addFavoritePlace('p1');
  await removeFavoritePlace('p1');
  expect(cleared().filter(p => p === 'today:')).toHaveLength(2);
});
