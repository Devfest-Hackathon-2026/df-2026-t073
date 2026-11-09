import { submitAnswer } from '../src/api/review';
import { request } from '../src/api/client';

// Use the real submitAnswer (not the mock) and capture the HTTP request.
jest.mock('../src/api/client', () => ({
  ...jest.requireActual('../src/api/client'),
  pick: (_area: string, _mock: unknown, real: unknown) => real,
  request: jest.fn(async () => ({
    exercise_id: 'rs_1-0',
    correct: false,
    stale: true,
  })),
}));

const requestMock = request as jest.MockedFunction<typeof request>;

function sent(): { path: string; body: Record<string, unknown> } {
  const [path, opts] = requestMock.mock.calls[0];
  return { path, body: opts?.body as Record<string, unknown> };
}

describe('submitAnswer', () => {
  beforeEach(() => requestMock.mockClear());

  test('posts the answer to the session endpoint', async () => {
    await submitAnswer('rs_1', 'rs_1-0', { kind: 'pick', index: 2 });
    expect(requestMock.mock.calls[0][1]?.method).toBe('POST');
    expect(sent().path).toBe('/api/v1/review/session/rs_1/answers');
    expect(sent().body).toEqual({
      exercise_id: 'rs_1-0',
      kind: 'pick',
      index: 2,
    });
  });

  test('"Show answer" is sent as a reveal, typed text as typed', async () => {
    await submitAnswer('rs_1', 'rs_1-7', { kind: 'reveal' });
    expect(sent().body).toEqual({ exercise_id: 'rs_1-7', kind: 'reveal' });
    requestMock.mockClear();
    await submitAnswer('rs_1', 'rs_1-7', { kind: 'typed', text: 'しょっけん' });
    expect(sent().body).toEqual({
      exercise_id: 'rs_1-7',
      kind: 'typed',
      text: 'しょっけん',
    });
  });

  test("returns the server's verdict", async () => {
    const verdict = await submitAnswer('rs_1', 'rs_1-0', {
      kind: 'flip',
      rating: 'good',
    });
    expect(verdict).toEqual({
      exerciseId: 'rs_1-0',
      correct: false,
      stale: true,
    });
  });

  test('without a session id nothing is sent', async () => {
    expect(
      await submitAnswer(null, 'ex-1', { kind: 'flip', rating: 'good' }),
    ).toBeNull();
    expect(requestMock).not.toHaveBeenCalled();
  });
});
