import React from 'react';
import { Text, TextInput } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import { LoginScreen } from '../src/screens/auth/LoginScreen';

const mockSignIn = jest.fn(async () => undefined);
const mockSignUp = jest.fn(async () => undefined);
const mockUpdate = jest.fn();

jest.mock('../src/state/AuthContext', () => ({
  useAuth: () => ({ signIn: mockSignIn, signUp: mockSignUp }),
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
    mockUpdate.mockClear();
  });

  test('new account starts on day one', async () => {
    const tree = await renderLogin();
    await press(tree, "Don't have an account? Create one");
    await fill(tree);
    await press(tree, 'Create account');

    expect(mockSignUp).toHaveBeenCalledWith(
      'new@example.com',
      'password123',
    );
    expect(mockUpdate).toHaveBeenCalledWith({ dayOne: true });
  });

  test('existing account sign-in does not reset day one', async () => {
    const tree = await renderLogin();
    await fill(tree);
    await press(tree, 'Sign in');

    expect(mockSignIn).toHaveBeenCalledWith('new@example.com', 'password123');
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});
