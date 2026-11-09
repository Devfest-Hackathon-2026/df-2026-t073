import React from 'react';
import { Text } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import { getStaffAudio } from '../src/api/rehearse';
import {
  DisplayPreview,
  PracticePreview,
} from '../src/screens/me/SettingsPreviews';
import { SettingsProvider, useSettings } from '../src/state/SettingsContext';
import type { Settings } from '../src/types';

jest.mock('../src/api/rehearse', () => ({
  ...jest.requireActual('../src/api/rehearse'),
  getStaffAudio: jest.fn(async () => null),
}));
const audioMock = getStaffAudio as jest.MockedFunction<typeof getStaffAudio>;

let update!: (patch: Partial<Settings>) => void;
function Probe(): null {
  update = useSettings().update;
  return null;
}

async function render(node: React.ReactElement) {
  let tree!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    tree = ReactTestRenderer.create(
      <SettingsProvider>
        <Probe />
        {node}
      </SettingsProvider>,
    );
  });
  return tree;
}

async function set(patch: Partial<Settings>) {
  await ReactTestRenderer.act(async () => update(patch));
}

const texts = (tree: ReactTestRenderer.ReactTestRenderer) =>
  tree.root.findAllByType(Text).map(n => [n.props.children].flat().join(''));

describe('DisplayPreview', () => {
  test('section titles switch to Japanese with "Japanese in the app"', async () => {
    const tree = await render(<DisplayPreview />);
    await set({ appJapanese: 'little' });
    expect(texts(tree)).toEqual(expect.arrayContaining(['Prepare', 'Review']));
    await set({ appJapanese: 'some' });
    expect(texts(tree)).toEqual(expect.arrayContaining(['準備', 'Review']));
    await set({ appJapanese: 'lot' });
    expect(texts(tree)).toEqual(expect.arrayContaining(['準備', '復習']));
  });

  test('the word follows "Show Japanese as" and furigana', async () => {
    const tree = await render(<DisplayPreview />);
    await set({ showJapaneseAs: 'romaji' });
    expect(texts(tree)).toContain('shokken');
    await set({ showJapaneseAs: 'kanji', furigana: true });
    expect(texts(tree)).toEqual(expect.arrayContaining(['食券', 'しょっけん']));
    await set({ furigana: false });
    expect(texts(tree)).toContain('食券');
    expect(texts(tree)).not.toContain('しょっけん');
  });

  test('has no "Preview" caption', async () => {
    const tree = await render(<DisplayPreview />);
    expect(texts(tree).some(t => /preview/i.test(t))).toBe(false);
  });
});

describe('PracticePreview', () => {
  test('English after the staff line follows its toggle', async () => {
    const tree = await render(<PracticePreview />);
    await set({ englishAfterRoleplayLine: true });
    expect(texts(tree)).toContain('Welcome. Your meal ticket, please.');
    await set({ englishAfterRoleplayLine: false });
    expect(texts(tree)).not.toContain('Welcome. Your meal ticket, please.');
  });

  test('phrases are ordered by "Phrases shown first"', async () => {
    const tree = await render(<PracticePreview />);
    const labels = () => texts(tree).filter(t => t === 'Easy' || t === 'Keigo');
    await set({ phrasesFirst: 'keigo' });
    expect(labels()).toEqual(['Keigo', 'Easy']);
    await set({ phrasesFirst: 'easy' });
    expect(labels()).toEqual(['Easy', 'Keigo']);
  });

  test('play says the staff line at the chosen speed', async () => {
    const tree = await render(<PracticePreview />);
    await set({ staffSpeed: 'slower' });
    const play = tree.root.findAll(
      n =>
        n.props.accessibilityLabel === 'Play the staff line' &&
        typeof n.props.onPress === 'function',
    )[0];
    await ReactTestRenderer.act(async () => play!.props.onPress());
    expect(audioMock).toHaveBeenCalledWith(
      'いらっしゃいませ。食券をお願いします。',
      'slower',
    );
  });
});
