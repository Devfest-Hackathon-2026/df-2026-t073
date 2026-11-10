import React from 'react';
import { Text } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import { setOnlineStatus } from '../src/cache/network';
import { OfflineBanner } from '../src/components/OfflineBanner';
import { copy } from '../src/copy';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const shown = (tree: ReactTestRenderer.ReactTestRenderer) =>
  tree.root
    .findAllByType(Text)
    .some(t => t.props.children === copy.offline.banner);

test('shows while offline and hides when back online', async () => {
  setOnlineStatus(true);
  let tree!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    tree = ReactTestRenderer.create(<OfflineBanner />);
  });
  expect(shown(tree)).toBe(false);

  await ReactTestRenderer.act(async () => setOnlineStatus(false));
  expect(shown(tree)).toBe(true);

  await ReactTestRenderer.act(async () => setOnlineStatus(true));
  expect(shown(tree)).toBe(false);
});
