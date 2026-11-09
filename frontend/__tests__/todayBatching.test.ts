import { getToday } from '../src/api/places';
import { getCache } from '../src/cache/storage';

jest.mock('../src/config', () => ({
  ...jest.requireActual('../src/config'),
  isLive: () => true, // force live branch so getToday calls request
}));

jest.mock('../src/api/client', () => {
  const actual = jest.requireActual('../src/api/client');
  return {
    ...actual,
    request: jest.fn(),
  };
});

describe('Today batching and review card cache seeding', () => {
  it('parses review_card and total_tango from today payload and seeds review:card cache', async () => {
    const { request } = require('../src/api/client');

    (request as jest.Mock).mockResolvedValueOnce({
      user_name: 'Hiroshi',
      up_next: null,
      pins: [],
      areas: [],
      starter_tango: [],
      word_of_day: null,
      total_tango: 15,
      review_card: {
        due_count: 5,
        minutes: 2,
        areas: ['Koenji'],
        sample: [],
        more_count: 0,
      },
    });

    const summary = await getToday();
    expect(summary.userName).toBe('Hiroshi');
    expect(summary.totalTango).toBe(15);
    expect(summary.reviewCard).toBeDefined();
    expect(summary.reviewCard?.dueCount).toBe(5);
    expect(summary.reviewCard?.minutes).toBe(2);

    // Verify cache seeding for review:card
    const cachedReview = await getCache<{ dueCount: number }>('review:card');
    expect(cachedReview).not.toBeNull();
    expect(cachedReview?.data.dueCount).toBe(5);
  });
});

