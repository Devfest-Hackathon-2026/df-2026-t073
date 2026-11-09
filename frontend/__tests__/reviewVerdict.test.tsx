import React from 'react';
import { Text, TextInput } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import { getReviewSession, submitAnswer } from '../src/api/review';
import { SESSION } from '../src/mocks/review';
import type { RootScreenProps } from '../src/navigation/types';
import { ReviewSessionScreen } from '../src/screens/review/ReviewSessionScreen';
import { SettingsProvider } from '../src/state/SettingsContext';

// A session of two questions from the mocks: an MCQ (ex-3) and a fill reading (ex-7).
jest.mock('../src/api/review', () => {
  const { SESSION: mockSession, SESSION_RESULT: mockResult } =
    jest.requireActual('../src/mocks/review');
  return {
    getReviewSession: jest.fn(async () => ({
      sessionId: 'rs_test',
      exercises: [mockSession[2], mockSession[6]],
    })),
    submitAnswer: jest.fn(async () => null),
    getSessionResult: jest.fn(async () => mockResult),
  };
});

const submitMock = submitAnswer as jest.MockedFunction<typeof submitAnswer>;
type Props = RootScreenProps<'ReviewSession'>;

async function renderSession(): Promise<ReactTestRenderer.ReactTestRenderer> {
  const nav = {
    goBack: jest.fn(),
    navigate: jest.fn(),
  } as unknown as Props['navigation'];
  const route = {
    key: 'ReviewSession',
    name: 'ReviewSession',
    params: {},
  } as unknown as Props['route'];
  let tree!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    tree = ReactTestRenderer.create(
      <SettingsProvider>
        <ReviewSessionScreen navigation={nav} route={route} />
      </SettingsProvider>,
    );
  });
  return tree;
}

function allTexts(tree: ReactTestRenderer.ReactTestRenderer): string {
  return tree.root
    .findAllByType(Text)
    .map(n => n.props.children)
    .flat()
    .join(' ');
}

async function press(tree: ReactTestRenderer.ReactTestRenderer, label: string) {
  const btn = tree.root.findAll(
    n =>
      typeof n.props.onPress === 'function' &&
      n
        .findAllByType(Text)
        .some(t => [t.props.children].flat().join('') === label),
  )[0];
  expect(btn).toBeDefined();
  await ReactTestRenderer.act(async () => {
    btn!.props.onPress();
  });
}

describe('session answers and the server verdict', () => {
  beforeEach(() => {
    submitMock.mockReset();
    submitMock.mockResolvedValue(null);
  });

  test('a picked option is sent as a pick for that exercise', async () => {
    const tree = await renderSession();
    await press(tree, 'meal ticket');
    const mcq = SESSION[2];
    if (mcq.type !== 'mcq') {
      throw new Error('mock exercise ex-3 should be an MCQ');
    }
    expect(submitMock).toHaveBeenCalledWith('rs_test', 'ex-3', {
      kind: 'pick',
      index: mcq.options.indexOf('meal ticket'),
    });
    expect(allTexts(tree)).toContain('Correct!');
  });

  test("the server's verdict replaces the instant feedback", async () => {
    submitMock.mockResolvedValue({
      exerciseId: 'ex-3',
      correct: false,
      stale: false,
    });
    const tree = await renderSession();
    await press(tree, 'meal ticket');
    expect(allTexts(tree)).toContain('Not quite');
    expect(allTexts(tree)).not.toContain('Correct!');
  });

  test('a stale answer says it did not count and shows no level change', async () => {
    submitMock.mockResolvedValue({
      exerciseId: 'ex-3',
      correct: true,
      stale: true,
    });
    const tree = await renderSession();
    await press(tree, 'meal ticket');
    expect(allTexts(tree)).toContain('Correct!');
    expect(allTexts(tree)).toContain("This one didn't count");
    expect(allTexts(tree)).not.toContain('Level up');
  });

  test('a verdict for an earlier exercise does not change the current one', async () => {
    let resolveFirst!: (v: {
      exerciseId: string;
      correct: boolean;
      stale: boolean;
    }) => void;
    submitMock.mockImplementationOnce(
      () => new Promise(resolve => (resolveFirst = resolve)),
    );
    const tree = await renderSession();
    await press(tree, 'meal ticket');
    await press(tree, 'Continue');
    await press(tree, 'Show answer');
    expect(allTexts(tree)).toContain("Here's the answer");
    await ReactTestRenderer.act(async () => {
      resolveFirst({ exerciseId: 'ex-3', correct: false, stale: true });
    });
    expect(allTexts(tree)).toContain("Here's the answer");
    expect(allTexts(tree)).not.toContain("This one didn't count");
  });

  test('"Show answer" on a fill question is sent as a reveal', async () => {
    const tree = await renderSession();
    await press(tree, 'meal ticket');
    await press(tree, 'Continue');
    await press(tree, 'Show answer');
    expect(submitMock).toHaveBeenLastCalledWith('rs_test', 'ex-7', {
      kind: 'reveal',
    });
  });
});

describe('flashcards skip the feedback screen', () => {
  const sessionMock = getReviewSession as jest.MockedFunction<
    typeof getReviewSession
  >;

  beforeEach(() => {
    submitMock.mockReset();
    submitMock.mockResolvedValue(null);
  });

  async function rateFirstFlashcard(rating: 'Good' | 'Again') {
    const tree = await renderSession();
    await press(tree, 'Flip card');
    await press(tree, rating);
    return tree;
  }

  test('rating goes straight to the next question and sends a flip', async () => {
    sessionMock.mockResolvedValueOnce({
      sessionId: 'rs_test',
      exercises: [SESSION[0], SESSION[2]],
    });
    const tree = await rateFirstFlashcard('Good');
    expect(submitMock).toHaveBeenCalledWith('rs_test', 'ex-1', {
      kind: 'flip',
      rating: 'good',
    });
    expect(allTexts(tree)).not.toContain('Correct!');
    expect(allTexts(tree)).not.toContain('Continue');
    expect(allTexts(tree)).toContain('Level up for');
  });

  test('a stale verdict changes the toast', async () => {
    sessionMock.mockResolvedValueOnce({
      sessionId: 'rs_test',
      exercises: [SESSION[0], SESSION[2]],
    });
    submitMock.mockResolvedValue({
      exerciseId: 'ex-1',
      correct: true,
      stale: true,
    });
    const tree = await rateFirstFlashcard('Good');
    expect(allTexts(tree)).toContain("Didn't count: practiced elsewhere");
  });

  test('rating the last question finishes the session', async () => {
    sessionMock.mockResolvedValueOnce({
      sessionId: 'rs_test',
      exercises: [SESSION[0]],
    });
    const tree = await rateFirstFlashcard('Again');
    expect(allTexts(tree)).toContain('Excellent work!');
  });
});

describe('review session wording', () => {
  beforeEach(() => {
    submitMock.mockReset();
    submitMock.mockResolvedValue(null);
  });

  async function toFillQuestion() {
    const tree = await renderSession();
    await press(tree, 'meal ticket');
    await press(tree, 'Continue');
    return tree;
  }

  test('"Show answer" shows the answer without a right/wrong mark', async () => {
    const tree = await toFillQuestion();
    await press(tree, 'Show answer');
    expect(allTexts(tree)).toContain("Here's the answer");
    expect(allTexts(tree)).not.toContain('Not quite');
    expect(allTexts(tree)).not.toContain('Correct!');
  });

  test('a wrong typed answer says "Not quite"', async () => {
    const tree = await toFillQuestion();
    const input = tree.root.findByType(TextInput);
    await ReactTestRenderer.act(async () => {
      input.props.onChangeText('ちがう');
    });
    await press(tree, 'Check');
    expect(allTexts(tree)).toContain('Not quite');
  });

  test('the level banner never names the next stage', async () => {
    const tree = await renderSession();
    await press(tree, 'meal ticket');
    expect(allTexts(tree)).toContain('Level up!');
    expect(allTexts(tree)).not.toMatch(/Level up →|Photo MCQ/);
  });

  test('fill questions use one placeholder and no instruction under the word', async () => {
    const tree = await toFillQuestion();
    expect(tree.root.findByType(TextInput).props.placeholder).toBe(
      'Type your answer here',
    );
    expect(allTexts(tree)).not.toContain('Type the reading in kana');
    expect(allTexts(tree)).not.toContain('Synonyms are accepted');
  });

  test('the place shows only after pressing the hint button, as a short label', async () => {
    const tree = await renderSession();
    expect(allTexts(tree)).not.toContain('Where did I see this Tango?');
    const hint = tree.root.findAll(
      n =>
        n.props.accessibilityLabel === 'Where did I see this Tango?' &&
        typeof n.props.onPress === 'function',
    )[0];
    expect(hint).toBeDefined();
    await ReactTestRenderer.act(async () => {
      hint!.props.onPress();
    });
    expect(allTexts(tree)).toContain(SESSION[2].placeHint);
    expect(allTexts(tree)).not.toContain('You saved this at');
  });
});
