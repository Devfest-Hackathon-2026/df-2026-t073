import { submitAnswer } from '../src/api/review';
import { request } from '../src/api/client';

// Use the real submitAnswer (not the mock) and capture the HTTP request.
jest.mock('../src/api/client', () => ({
  ...jest.requireActual('../src/api/client'),
  pick: (_area: string, _mock: unknown, real: unknown) => real,
  request: jest.fn(async () => ({})),
}));

const requestMock = request as jest.MockedFunction<typeof request>;

function sentBody(): Record<string, unknown> {
  const [, opts] = requestMock.mock.calls[0];
  return opts?.body as Record<string, unknown>;
}

describe('submitAnswer', () => {
  beforeEach(() => requestMock.mockClear());

  test('"Show answer" on a fill question sends an empty answer so the miss is graded', async () => {
    await submitAnswer('t1', false, 'rs_1', { questionType: 'fill_text_translate' });
    expect(sentBody()).toMatchObject({
      correct: false,
      question_type: 'fill_text_translate',
      answer: '',
      session_id: 'rs_1',
    });
  });

  test('a typed fill answer is sent as typed', async () => {
    await submitAnswer('t1', true, 'rs_1', {
      questionType: 'fill_text_reading',
      answer: 'しょっけん',
    });
    expect(sentBody().answer).toBe('しょっけん');
  });

  test('non-fill questions send no answer', async () => {
    await submitAnswer('t1', true, null, { questionType: 'mcq_text_reading' });
    expect(sentBody().answer).toBeUndefined();
    expect(sentBody().session_id).toBeUndefined();
  });
});
