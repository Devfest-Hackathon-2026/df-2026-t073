import React from 'react';
import { Text, View } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import { Jp } from '../src/components/Jp';
import { SettingsProvider, useSettings } from '../src/state/SettingsContext';

function FuriganaOn({ children }: { children: React.ReactNode }) {
  const { settings, update } = useSettings();
  React.useEffect(() => {
    update({ showJapaneseAs: 'kanji', furigana: true });
  }, [update]);
  return settings.furigana ? <>{children}</> : null;
}

async function texts(node: React.ReactElement) {
  let tree!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    tree = ReactTestRenderer.create(
      <SettingsProvider>
        <FuriganaOn>{node}</FuriganaOn>
      </SettingsProvider>,
    );
  });
  const all = tree.root
    .findAllByType(Text)
    .map(n => [n.props.children].flat().join(''));
  await ReactTestRenderer.act(async () => tree.unmount());
  return all;
}

test('furigana shows over kanji', async () => {
  expect(await texts(<Jp text="食券" reading="しょっけん" />)).toEqual([
    'しょっけん',
    '食券',
  ]);
});

test('no furigana over kana-only text', async () => {
  expect(await texts(<Jp text="ラーメン" reading="らーめん" />)).toEqual([
    'ラーメン',
  ]);
});

test('furigana={false} turns furigana off, e.g. for place names', async () => {
  expect(
    await texts(
      <Jp text="麺屋たいき" reading="めんやたいき" furigana={false} />,
    ),
  ).toEqual(['麺屋たいき']);
});

test('without keepFuriganaLine, kana words have no empty line (pills center them)', async () => {
  let tree!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    tree = ReactTestRenderer.create(
      <SettingsProvider>
        <FuriganaOn>
          <Jp text="かため" keepFuriganaLine={false} />
        </FuriganaOn>
      </SettingsProvider>,
    );
  });
  // Only the word's own Text and its column View: no furigana line.
  expect(tree.root.findAllByType(View)).toHaveLength(1);
  await ReactTestRenderer.act(async () => tree.unmount());
});
