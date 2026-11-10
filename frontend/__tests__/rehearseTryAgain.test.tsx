import React from 'react';
import { Text } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import { Conversation } from '../src/screens/rehearse/RehearseScreen';
import { SettingsProvider } from '../src/state/SettingsContext';
import type { RehearsalScript } from '../src/types';

const mockAnswer = jest.fn();
jest.mock('../src/api/rehearse', () => ({
  answerTurn: (...args: unknown[]) => mockAnswer(...args),
  getStaffAudio: jest.fn().mockResolvedValue(null),
  startRehearsal: jest.fn(),
}));
jest.mock('../src/audio/audio', () => ({
  playUrl: jest.fn().mockResolvedValue(undefined),
  stopPlaying: jest.fn(),
  requestMicPermission: jest.fn().mockResolvedValue(false),
  startRecording: jest.fn(),
  stopRecording: jest.fn(),
}));

const jp = (text: string) => ({ text, reading: text, romaji: '', meaning: '' });
const SCRIPT = {
  rehearsalId: null,
  staffVoice: '',
  place: { id: 'p', name: jp('店') },
  turns: [
    { id: 's1', speaker: 'staff', jp: jp('いらっしゃいませ'), en: 'Welcome' },
    {
      id: 'u1',
      speaker: 'user',
      jp: jp('こんにちは'),
      en: 'Hello',
      choices: [
        {
          jp: jp('こんにちは'),
          en: 'Hello',
          ok: true,
          label: 'Natural',
          note: '',
        },
      ],
    },
    { id: 's2', speaker: 'staff', jp: jp('どうぞ'), en: 'Go ahead' },
    {
      id: 'u2',
      speaker: 'user',
      jp: jp('ありがとう'),
      en: 'Thanks',
      choices: [
        {
          jp: jp('ありがとう'),
          en: 'Thanks',
          ok: true,
          label: 'Natural',
          note: '',
        },
      ],
    },
  ],
} as unknown as RehearsalScript;

const texts = (tree: ReactTestRenderer.ReactTestRenderer) =>
  tree.root.findAllByType(Text).map(t => [t.props.children].flat().join(''));

const pressText = (tree: ReactTestRenderer.ReactTestRenderer, label: string) =>
  tree.root
    .findAll(
      n =>
        (typeof n.props.onPress === 'function' &&
          n.type === Text &&
          [n.props.children].flat().join('') === label) ||
        false,
    )[0]
    .props.onPress();

test('Try again reopens the latest reply', async () => {
  jest.useFakeTimers();
  mockAnswer.mockResolvedValue({
    said: jp('こんにちは'),
    spoken: false,
    ok: false,
    label: 'Not quite',
    note: '',
  });
  let tree!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    tree = ReactTestRenderer.create(
      <SettingsProvider>
        <Conversation script={SCRIPT} speed="natural" onFinish={() => {}} />
      </SettingsProvider>,
    );
  });
  // Choose a reply instead of speaking.
  await ReactTestRenderer.act(async () => {
    pressText(tree, "Can't speak right now? Choose a reply");
  });
  const choice = tree.root.findAll(
    n => n.props.accessibilityRole === 'button' && n.props.disabled === false,
  )[0];
  await ReactTestRenderer.act(async () => {
    choice.props.onPress();
  });
  expect(texts(tree)).toContain('Not quite');
  expect(texts(tree)).toContain('Try again');

  await ReactTestRenderer.act(async () => {
    pressText(tree, 'Try again');
  });
  // The reply is open again: no rating, and it's the user's turn.
  expect(texts(tree)).not.toContain('Not quite');
  expect(texts(tree)).not.toContain('Try again');
  expect(texts(tree)).toContain('Your turn');
  jest.useRealTimers();
});
