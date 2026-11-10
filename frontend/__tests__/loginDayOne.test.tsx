import React from 'react';
import { Text, TextInput } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import { LoginScreen } from '../src/screens/auth/LoginScreen';

const mockSignIn = jest.fn(async () => undefined);
const mockSignUp = jest.fn(async () => undefined);
const mockSignInWithGoogle = jest.fn(async () => null);
const mockUpdate = jest.fn();

jest.mock('../src/state/AuthContext', () => ({
  useAuth: () => ({
    signIn: mockSignIn,
    signUp: mockSignUp,
    signInWithGoogle: mockSignInWithGoogle,
  }),
}));

jest.mock('../src/state/SettingsContext', () => ({
  useSettings: () => ({ update: mockUpdate }),
}));

async function renderLogin() {
  let tree!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    tree = ReactTestRenderer.create(<LoginScreen />);
  });
  return tree;
}

async function fill(tree: ReactTestRenderer.ReactTestRenderer) {
  const inputs = tree.root.findAllByType(TextInput);
  await ReactTestRenderer.act(async () => {
    inputs[0].props.onChangeText('new@example.com');
    inputs[1].props.onChangeText('password123');
  });
}

async function press(tree: ReactTestRenderer.ReactTestRenderer, label: string) {
  const button = tree.root.findAll(
    node =>
      typeof node.props.onPress === 'function' &&
      node
        .findAllByType(Text)
        .some(text => [text.props.children].flat().join('') === label),
  )[0];
  expect(button).toBeDefined();
  await ReactTestRenderer.act(async () => button!.props.onPress());
}

describe('account creation onboarding', () => {
  beforeEach(() => {
    mockSignIn.mockClear();
    mockSignUp.mockClear();
    mockSignInWithGoogle.mockClear();
    mockUpdate.mockClear();
  });

  test('new account starts on day one', async () => {
    const tree = await renderLogin();
    await press(tree, "Don't have an account? Create one");
    await fill(tree);
    await press(tree, 'Create account');

    expect(mockSignUp).toHaveBeenCalledWith('new@example.com', 'password123');
    expect(mockUpdate).toHaveBeenCalledWith({
      dayOne: true,
      rehearsedOnce: false,
    });
  });

  test('existing account sign-in does not reset day one and marks onboarded', async () => {
    const tree = await renderLogin();
    await fill(tree);
    await press(tree, 'Sign in');

    expect(mockSignIn).toHaveBeenCalledWith('new@example.com', 'password123');
    expect(mockUpdate).toHaveBeenCalledWith({ onboarded: true });
    expect(mockUpdate).not.toHaveBeenCalledWith(
      expect.objectContaining({ dayOne: true }),
    );
  });

  test('new Google account starts on day one', async () => {
    const now = new Date().toISOString();
    mockSignInWithGoogle.mockResolvedValueOnce({
      metadata: { creationTime: now, lastSignInTime: now },
    } as any);

    const tree = await renderLogin();
    await press(tree, 'Continue with Google');

    expect(mockSignInWithGoogle).toHaveBeenCalled();
    expect(mockUpdate).toHaveBeenCalledWith({
      dayOne: true,
      rehearsedOnce: false,
    });
  });

  test('existing Google account marks onboarded without resetting day one', async () => {
    const created = new Date(Date.now() - 100000).toISOString();
    const now = new Date().toISOString();
    mockSignInWithGoogle.mockResolvedValueOnce({
      metadata: { creationTime: created, lastSignInTime: now },
    } as any);

    const tree = await renderLogin();
    await press(tree, 'Continue with Google');

    expect(mockSignInWithGoogle).toHaveBeenCalled();
    expect(mockUpdate).toHaveBeenCalledWith({ onboarded: true });
    expect(mockUpdate).not.toHaveBeenCalledWith(
      expect.objectContaining({ dayOne: true }),
    );
  });
});
