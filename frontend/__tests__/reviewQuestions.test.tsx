import React from 'react';
import { Text, TextInput } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import {
  checkFillAnswer,
  hasNonKanaForReading,
  normalizeAnswer,
  normalizeMeaning,
} from '../src/features/review/answerCheck';
import { SESSION, SESSION_RESULT } from '../src/mocks/review';
import {
  PhotoLayerView,
  ReviewSessionScreen,
} from '../src/screens/review/ReviewSessionScreen';
import { SettingsProvider } from '../src/state/SettingsContext';
import type { QuestionType } from '../src/types';

jest.mock('../src/api/review', () => {
  const { SESSION: mockSession, SESSION_RESULT: mockResult } =
    jest.requireActual('../src/mocks/review');
  return {
    getReviewSession: jest.fn(async () => ({
      sessionId: 'rs_test',
      exercises: mockSession,
    })),
    submitAnswer: jest.fn(async () => {}),
    getSessionResult: jest.fn(async () => mockResult),
  };
});

describe('answerCheck', () => {
  const cases: Array<
    [QuestionType, 'kana' | 'meaning', string[], string, boolean]
  > = [
    [
      'fill_text_reading',
      'kana',
      ['しょっけん'],
      'しょっけん',
      true,
    ],
    [
      'fill_text_reading',
      'kana',
      ['こーひー'],
      'コーヒー',
      true,
    ],
    [
      'fill_text_reading',
      'kana',
      ['こーひー'],
      'ｺｰﾋｰ',
      true,
    ],
    [
      'fill_text_reading',
      'kana',
      ['しょっけん'],
      'しょけん',
      false,
    ],
    [
      'fill_text_reading',
      'kana',
      ['こーひー'],
      'こおひい',
      false,
    ],
    [
      'fill_text_reading',
      'kana',
      ['しょっけん'],
      'shokken',
      false,
    ],
    [
      'fill_text_reverse',
      'kana',
      ['食券', 'しょっけん'],
      'shokken',
      false,
    ],
    [
      'fill_text_reverse',
      'kana',
      ['食券', 'しょっけん'],
      '食券',
      true,
    ],
    [
      'fill_text_reverse',
      'kana',
      ['食券', 'しょっけん'],
      'しょっけん',
      true,
    ],
    [
      'fill_text_reverse',
      'kana',
      ['食券', 'しょっけん'],
      'ショッケン',
      true,
    ],
    [
      'fill_object_name',
      'kana',
      ['傘立て', 'かさたて'],
      '傘立て',
      true,
    ],
    [
      'fill_object_name',
      'kana',
      ['傘立て', 'かさたて'],
      'かさたて',
      true,
    ],
    [
      'fill_text_reading',
      'kana',
      ['しょっけん'],
      '食券',
      false,
    ],
    [
      'fill_text_translate',
      'meaning',
      ['meal ticket', 'food voucher', 'coupon'],
      'meal ticket',
      true,
    ],
    [
      'fill_text_translate',
      'meaning',
      ['meal ticket', 'food voucher', 'coupon'],
      'a meal ticket',
      true,
    ],
    [
      'fill_text_translate',
      'meaning',
      ['meal ticket', 'food voucher', 'coupon'],
      'Food Voucher',
      true,
    ],
    [
      'fill_text_translate',
      'meaning',
      ['meal ticket', 'food voucher', 'coupon'],
      'coupon',
      true,
    ],
    [
      'fill_text_translate',
      'meaning',
      ['meal ticket'],
      'meel ticket',
      false,
    ],
  ];

  test.each(cases)(
    '%s (%s): "%s" -> %s',
    (qtype, kind, accepted, given, expected) => {
      expect(checkFillAnswer(given, accepted, kind, qtype)).toBe(expected);
    },
  );

  test('detects kanji and Latin characters in reading answers', () => {
    expect(hasNonKanaForReading('食券')).toBe(true);
    expect(hasNonKanaForReading('shokken')).toBe(true);
    expect(hasNonKanaForReading('しょっけん')).toBe(false);
    expect(hasNonKanaForReading('コーヒー')).toBe(false);
  });

  test('normalizes katakana and articles', () => {
    expect(normalizeAnswer('  コーヒー  ')).toBe('こーひー');
    expect(normalizeMeaning('To Eat')).toBe('eat');
    expect(normalizeMeaning('the meal ticket')).toBe('meal ticket');
  });
});

describe('SESSION mock coverage', () => {
  test('includes all 10 question types in stage order', () => {
    const types = SESSION.map(e => e.questionType);
    expect(new Set(types)).toEqual(
      new Set<QuestionType>([
        'flashcard_text',
        'flashcard_object',
        'mcq_text_reading',
        'mcq_text_translate',
        'mcq_text_reverse',
        'mcq_object_name',
        'fill_text_reading',
        'fill_text_translate',
        'fill_text_reverse',
        'fill_object_name',
      ]),
    );
  });

  test('PhotoLayerView renders nothing when photo is null and renders caption when provided', async () => {
    let emptyTree!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(() => {
      emptyTree = ReactTestRenderer.create(<PhotoLayerView photo={null} />);
    });
    expect(emptyTree.toJSON()).toBeNull();

    let photoTree!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(() => {
      photoTree = ReactTestRenderer.create(
        <SettingsProvider>
          <PhotoLayerView
            photo={{
              caption: 'Your photo · Koenji',
              box: { x: 0.2, y: 0.3, w: 0.4, h: 0.2 },
              lines: ['食券'],
            }}
          />
        </SettingsProvider>,
      );
    });
    const texts = photoTree.root
      .findAllByType(Text)
      .map(n => n.props.children)
      .flat();
    expect(texts).toContain('Your photo · Koenji');
    expect(TextInput).toBeDefined();
  });

  test('ReviewSessionScreen supports flip, MCQ select, and fill-in-the-blank kana check', async () => {
    const nav = {
      goBack: jest.fn(),
      popToTop: jest.fn(),
      navigate: jest.fn(),
      replace: jest.fn(),
    } as any;
    const route = { key: 'ReviewSession', name: 'ReviewSession', params: {} } as any;

    let tree!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      tree = ReactTestRenderer.create(
        <SettingsProvider>
          <ReviewSessionScreen navigation={nav} route={route} />
        </SettingsProvider>,
      );
    });

    const allTexts = () =>
      tree.root
        .findAllByType(Text)
        .map(n => n.props.children)
        .flat()
        .join(' ');

    const pressByText = (label: string) => {
      const btn = tree.root.findAll(
        n =>
          typeof n.props.onPress === 'function' &&
          n
            .findAllByType(Text)
            .some(t => [t.props.children].flat().join('') === label),
      )[0];
      expect(btn).toBeDefined();
      btn!.props.onPress();
    };

    // 1. Starts on ex-1 (flashcard_text)
    expect(allTexts()).toContain('Flashcard · Text');
    await ReactTestRenderer.act(async () => {
      pressByText('Flip card');
    });
    expect(allTexts()).toContain('How well did you know it?');

    // Rate "Good" -> no feedback screen: straight to ex-2 with a toast
    await ReactTestRenderer.act(async () => {
      pressByText('Good');
    });
    expect(allTexts()).not.toContain('Correct!');
    expect(allTexts()).toContain('Level up for');
    expect(allTexts()).toContain('Flashcard · Object');

    // ex-2 (flashcard_object): rating moves straight on as well
    await ReactTestRenderer.act(async () => {
      pressByText('Flip card');
    });
    await ReactTestRenderer.act(async () => {
      pressByText('Easy');
    });

    // 2. Now on ex-3 (mcq_text_translate at stage mcq_photo)
    expect(allTexts()).toContain('Translate · Multiple choice');
    await ReactTestRenderer.act(async () => {
      pressByText('meal ticket');
    });
    expect(allTexts()).toContain('Correct!');
    expect(allTexts()).toContain('Level up!');

    // Advance past ex-4, ex-5, ex-6 to ex-7 (fill_text_reading)
    for (const answerLabel of ['おおもり', '替え玉', '立入禁止']) {
      await ReactTestRenderer.act(async () => {
        pressByText('Continue');
      });
      await ReactTestRenderer.act(async () => {
        pressByText(answerLabel);
      });
    }
    await ReactTestRenderer.act(async () => {
      pressByText('Continue');
    });

    // 3. Now on ex-7 (fill_text_reading)
    expect(allTexts()).toContain('Reading · Type the answer');
    const input = tree.root.findByType(TextInput);

    // Typing kanji triggers "Please answer in kana" instead of grading wrong
    await ReactTestRenderer.act(async () => {
      input.props.onChangeText('食券');
    });
    await ReactTestRenderer.act(async () => {
      pressByText('Check');
    });
    expect(allTexts()).toContain('Please answer in kana');

    // Typing kana grades as Correct!
    await ReactTestRenderer.act(async () => {
      input.props.onChangeText('しょっけん');
    });
    await ReactTestRenderer.act(async () => {
      pressByText('Check');
    });
    expect(allTexts()).toContain('Correct!');
    expect(SESSION_RESULT.reviewed).toBe(14);
  });
});
