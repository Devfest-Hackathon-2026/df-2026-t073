import React from 'react';
import { Text } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import { TANGO } from '../src/mocks/tango';
import type { RootScreenProps } from '../src/navigation/types';
import { RehearseResultsScreen } from '../src/screens/rehearse/RehearseResultsScreen';
import { TangoDetailScreen } from '../src/screens/tango/TangoDetailScreen';
import { SettingsProvider } from '../src/state/SettingsContext';

jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn() }),
  useIsFocused: () => true,
}));

const mounted: ReactTestRenderer.ReactTestRenderer[] = [];
beforeEach(() => jest.useFakeTimers());
afterEach(async () => {
  for (const tree of mounted.splice(0)) {
    await ReactTestRenderer.act(async () => tree.unmount());
  }
  jest.useRealTimers();
});

/** Render, then let the mock API delays run out. */
async function render(node: React.ReactElement) {
  let tree!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    tree = ReactTestRenderer.create(
      <SettingsProvider>{node}</SettingsProvider>,
    );
  });
  mounted.push(tree);
  await settle();
  return tree;
}

async function settle() {
  for (let i = 0; i < 3; i++) {
    await ReactTestRenderer.act(async () => {
      jest.advanceTimersByTime(1000);
    });
  }
}

const allTexts = (tree: ReactTestRenderer.ReactTestRenderer) =>
  tree.root
    .findAllByType(Text)
    .map(n => [n.props.children].flat().join(''))
    .join(' | ');

async function press(tree: ReactTestRenderer.ReactTestRenderer, label: string) {
  const target = tree.root.findAll(
    n =>
      (typeof n.props.onPress === 'function' &&
        n
          .findAllByType(Text)
          .some(t => [t.props.children].flat().join('') === label)) ||
      (n.props.accessibilityLabel === label &&
        typeof n.props.onPress === 'function'),
  )[0];
  expect(target).toBeDefined();
  await ReactTestRenderer.act(async () => {
    target!.props.onPress();
  });
  await settle();
}

const nav = {
  goBack: jest.fn(),
  navigate: jest.fn(),
  replace: jest.fn(),
  popToTop: jest.fn(),
};

test('a suggested line can be saved to the Tango in it', async () => {
  type Props = RootScreenProps<'RehearseResults'>;
  const tree = await render(
    <RehearseResultsScreen
      navigation={nav as unknown as Props['navigation']}
      route={
        {
          key: 'r',
          name: 'RehearseResults',
          params: { placeId: 'menya-taiki', hintsUsed: 0, rehearsalId: null },
        } as unknown as Props['route']
      }
    />,
  );
  // The mock suggestion "かためでお願いします。" contains the Tango かため.
  expect(allTexts(tree)).toContain('Save suggested version');
  await press(tree, 'Save suggested version');
  expect(allTexts(tree)).toContain('Saved to かため');
  expect(allTexts(tree)).not.toContain('Save suggested version');
});

test('saved sentences show on the Tango page and can be removed', async () => {
  TANGO.katame.savedSentences = [
    {
      id: 'sn1',
      jp: { text: 'かためでお願いします。', meaning: 'Firm noodles, please.' },
      kind: 'suggested',
      placeName: '麺屋たいき',
    },
  ];
  type Props = RootScreenProps<'TangoDetail'>;
  const tree = await render(
    <TangoDetailScreen
      navigation={nav as unknown as Props['navigation']}
      route={
        {
          key: 't',
          name: 'TangoDetail',
          params: { id: 'katame' },
        } as unknown as Props['route']
      }
    />,
  );
  expect(allTexts(tree)).toContain('Your sentences');
  expect(allTexts(tree)).toContain('Suggested · 麺屋たいき');
  expect(allTexts(tree)).toContain('Firm noodles, please.');
  await press(tree, 'Remove "かためでお願いします。"');
  expect(allTexts(tree)).not.toContain('Your sentences');
  // Leave the shared mock data as it was.
  delete TANGO.katame.savedSentences;
});
