import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import { Jp } from '../src/components/Jp';
import { copy } from '../src/copy';
import { LanguagesSection } from '../src/screens/me/MeSections';
import { SettingsProvider } from '../src/state/SettingsContext';

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
  tree.root
    .findAllByType(Text)
    .map(n => [n.props.children].flat().join(''))
    .join(' | ');

describe('Jp center', () => {
  test('centers the word column and its text', async () => {
    const tree = await render(<Jp text="食券" reading="しょっけん" center />);
    const column = StyleSheet.flatten(
      tree.root.findAllByType(View)[0].props.style,
    );
    expect(column.alignSelf).toBe('center');
    const word = tree.root
      .findAllByType(Text)
      .find(t => t.props.children === '食券');
    expect(StyleSheet.flatten(word!.props.style).textAlign).toBe('center');
  });

  test('keeps the default start alignment without it', async () => {
    const tree = await render(<Jp text="食券" />);
    const column = StyleSheet.flatten(
      tree.root.findAllByType(View)[0].props.style,
    );
    expect(column.alignSelf).toBe('flex-start');
  });
});

describe('settings wording', () => {
  test('section names', () => {
    expect(copy.meSections).toMatchObject({
      display: 'Display settings',
      practice: 'Conversation practice settings',
      languages: 'Native language',
      privacy: 'Map and location settings',
    });
  });

  test('the language list has a footer instead of an all-caps label', async () => {
    const tree = await render(<LanguagesSection />);
    const all = texts(tree);
    expect(all).not.toContain('Meanings, hints and feedback in');
    expect(
      all.endsWith('Meanings, hints and feedback are shown in this language.'),
    ).toBe(true);
  });
});
