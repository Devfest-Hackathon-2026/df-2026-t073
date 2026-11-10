import React from 'react';
import { Alert, type AlertButton } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import { deleteAccount } from '../src/api/user';
import { copy } from '../src/copy';
import { ProfileSection } from '../src/screens/me/MeSections';
import { SettingsProvider, useSettings } from '../src/state/SettingsContext';

const mockSignOut = jest.fn(() => Promise.resolve());
jest.mock('../src/state/AuthContext', () => ({
  useAuth: () => ({
    status: 'signed_in',
    user: { uid: 'u1', email: 'a@b.c', isAnonymous: false },
    signOut: mockSignOut,
  }),
}));
jest.mock('../src/api/user', () => ({
  ...jest.requireActual('../src/api/user'),
  getProfile: jest.fn(() =>
    Promise.resolve({
      name: 'Marcus',
      readingLevel: 'kana',
      homeArea: null,
      stats: { tango: 0, stars: 0, places: 0 },
    }),
  ),
  deleteAccount: jest.fn(),
}));
const deleteMock = deleteAccount as jest.MockedFunction<typeof deleteAccount>;

let onboarded: boolean | undefined;
let updateSettings: ReturnType<typeof useSettings>['update'] | undefined;
function Probe(): null {
  const ctx = useSettings();
  onboarded = ctx.settings.onboarded;
  updateSettings = ctx.update;
  return null;
}

async function render(): Promise<ReactTestRenderer.ReactTestRenderer> {
  let tree!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    tree = ReactTestRenderer.create(
      <SettingsProvider>
        <Probe />
        <ProfileSection />
      </SettingsProvider>,
    );
  });
  // Start from an onboarded user.
  await ReactTestRenderer.act(async () => updateSettings!({ onboarded: true }));
  expect(onboarded).toBe(true);
  return tree;
}

/** Press "Delete account", then the destructive button in the confirmation. */
async function deleteAndConfirm(tree: ReactTestRenderer.ReactTestRenderer) {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  const button = tree.root.findAll(
    n =>
      typeof n.props.onPress === 'function' &&
      n.props.label === copy.settings.deleteAccount,
  )[0];
  await ReactTestRenderer.act(async () => button.props.onPress());
  const buttons = alert.mock.calls[0][2] as AlertButton[];
  const destructive = buttons.find(b => b.style === 'destructive')!;
  await ReactTestRenderer.act(async () => {
    await destructive.onPress!();
  });
  return alert;
}

beforeEach(() => {
  mockSignOut.mockClear();
  deleteMock.mockReset();
});
afterEach(() => jest.restoreAllMocks());

test('deleting the account signs out and starts over from welcome', async () => {
  deleteMock.mockResolvedValue(undefined);
  const tree = await render();
  await deleteAndConfirm(tree);
  expect(deleteMock).toHaveBeenCalledTimes(1);
  expect(mockSignOut).toHaveBeenCalledTimes(1);
  expect(onboarded).toBe(false);
});

test('a failed delete keeps the user signed in and says so', async () => {
  deleteMock.mockRejectedValue(new Error('offline'));
  const tree = await render();
  const alert = await deleteAndConfirm(tree);
  expect(mockSignOut).not.toHaveBeenCalled();
  expect(onboarded).toBe(true);
  // A second alert explains the failure.
  expect(alert).toHaveBeenCalledTimes(2);
});
