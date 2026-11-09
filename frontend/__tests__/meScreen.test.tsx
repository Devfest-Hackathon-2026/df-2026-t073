import React from 'react';
import { Text } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import { MeScreen } from '../src/screens/me/MeScreen';
import { SettingsProvider } from '../src/state/SettingsContext';

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({ navigate: mockNavigate, goBack: jest.fn() }),
  useIsFocused: () => true,
}));
jest.mock('../src/state/AuthContext', () => ({
  useAuth: () => ({ user: null, signOut: jest.fn() }),
}));

let tree!: ReactTestRenderer.ReactTestRenderer;
beforeEach(async () => {
  jest.useFakeTimers();
  mockNavigate.mockClear();
  await ReactTestRenderer.act(async () => {
    tree = ReactTestRenderer.create(
      <SettingsProvider>
        <MeScreen />
      </SettingsProvider>,
    );
  });
  for (let i = 0; i < 3; i++) {
    await ReactTestRenderer.act(async () => {
      jest.advanceTimersByTime(1000);
    });
  }
});
afterEach(async () => {
  await ReactTestRenderer.act(async () => tree.unmount());
  jest.useRealTimers();
});

const texts = () =>
  tree.root.findAllByType(Text).map(n => [n.props.children].flat().join(''));

test('the profile section shows who you are and your stats', () => {
  const all = texts();
  expect(all).toContain('Reads hiragana and katakana');
  expect(all).toEqual(
    expect.arrayContaining(['Tango', 'Hana Stamps', 'Places']),
  );
  expect(all).not.toContain('Due today');
});

test('there is no separate "Profile" row; "Edit profile" opens the profile', async () => {
  expect(texts()).not.toContain('Profile');
  const edit = tree.root.findAll(
    n =>
      typeof n.props.onPress === 'function' &&
      n.findAllByType(Text).some(t => t.props.children === 'Edit profile'),
  )[0];
  await ReactTestRenderer.act(async () => edit!.props.onPress());
  expect(mockNavigate).toHaveBeenCalledWith('MeSection', {
    section: 'profile',
  });
});
