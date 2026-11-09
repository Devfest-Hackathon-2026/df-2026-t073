// The real (non-mock) adapters for saved rehearsal sentences.
import { request } from '../src/api/client';
import { getRehearsalResult, saveRehearsalSentence } from '../src/api/rehearse';
import { removeSavedSentence } from '../src/api/tango';

jest.mock('../src/api/client', () => ({
  ...jest.requireActual('../src/api/client'),
  pick: (_area: string, _mock: unknown, real: unknown) => real,
  request: jest.fn(),
}));

const requestMock = request as jest.MockedFunction<typeof request>;
beforeEach(() => requestMock.mockReset());

const PLACE = {
  id: 'p',
  name: { text: '麺屋たいき' },
  category: '',
  area: '',
  lat: 0,
  lng: 0,
  address: '',
};

test('result lines carry the turn and the Tango each version can be saved to', async () => {
  requestMock.mockResolvedValueOnce({
    place: PLACE,
    lines: [
      {
        turn_id: 'u2',
        staff: { text: 'かたさは？' },
        said: { text: 'ふつう' },
        spoken: true,
        ok: false,
        label: '',
        note: '',
        suggestion: { jp: { text: 'かためでお願いします。' }, why: '' },
        said_tango: [],
        suggestion_tango: [{ flashcard_id: 'fc_katame', text: 'かため' }],
      },
    ],
  });
  const [line] = (await getRehearsalResult('rh1', 'p')).lines;
  expect(line.turnId).toBe('u2');
  expect(line.saidTango).toEqual([]);
  expect(line.suggestionTango).toEqual([{ id: 'fc_katame', text: 'かため' }]);
});

test('saving posts the version and returns where it was saved', async () => {
  requestMock.mockResolvedValueOnce({
    saved_to: [{ flashcard_id: 'fc_katame', text: 'かため' }],
  });
  const saved = await saveRehearsalSentence('rh1', 'u2', true, []);
  const [path, opts] = requestMock.mock.calls[0];
  expect(path).toBe('/api/v1/rehearsals/rh1/turns/u2/save');
  expect(opts).toMatchObject({
    method: 'POST',
    body: { use_suggestion: true },
  });
  expect(saved).toEqual([{ id: 'fc_katame', text: 'かため' }]);
});

test('removing a sentence calls DELETE and maps the saved sentences', async () => {
  requestMock.mockResolvedValueOnce({
    flashcard_id: 'fc_katame',
    capture_id: '',
    item_id: null,
    image_url: '',
    bounding_box: [],
    kanji: 'かため',
    reading: 'かため',
    romaji: 'katame',
    meaning: 'firm',
    part_of_speech: 'Noun',
    kind: 'word',
    use_cases: [],
    related_vocab: [],
    review_stats: {
      review_count: 0,
      last_reviewed_at: null,
      next_review_at: '2026-11-01T00:00:00Z',
      mastered: false,
      stage: 'flashcard',
    },
    created_at: '2026-11-01T00:00:00Z',
    strength: 0,
    sightings: [],
    history: [],
    saved_sentences: [
      {
        sentence_id: 'sn2',
        text: 'かためで',
        reading: null,
        romaji: null,
        meaning: 'Firm',
        kind: 'yours',
        place_name: '麺屋たいき',
      },
    ],
  });
  const tango = await removeSavedSentence('fc_katame', 'sn1');
  const [path, opts] = requestMock.mock.calls[0];
  expect(path).toBe('/api/v1/flashcards/fc_katame/sentences/sn1');
  expect(opts).toMatchObject({ method: 'DELETE' });
  expect(tango.savedSentences).toEqual([
    {
      id: 'sn2',
      jp: {
        text: 'かためで',
        reading: undefined,
        romaji: undefined,
        meaning: 'Firm',
      },
      kind: 'yours',
      placeName: '麺屋たいき',
    },
  ]);
});
