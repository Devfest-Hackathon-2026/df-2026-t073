import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Screen } from '../../components/layout';
import { Button, Card } from '../../components/ui';
import { useAuth } from '../../state/AuthContext';
import { base } from '../../styles/base';
import {
  colors,
  fontSizes,
  fontWeights,
  radii,
  sizes,
  space,
} from '../../styles/tokens';

function formatAuthError(err: unknown): string {
  if (!err) {
    return 'An unknown error occurred.';
  }
  const msg = err instanceof Error ? err.message : String(err);
  const code = (err as { code?: string })?.code;

  if (
    code === 'auth/user-not-found' ||
    code === 'auth/wrong-password' ||
    code === 'auth/invalid-credential' ||
    code === 'auth/invalid-login-credentials'
  ) {
    return 'Incorrect email or password. Please try again.';
  }
  if (code === 'auth/email-already-in-use') {
    return 'An account with this email already exists. Please sign in instead.';
  }
  if (code === 'auth/weak-password') {
    return 'Password should be at least 6 characters.';
  }
  if (code === 'auth/invalid-email') {
    return 'Please enter a valid email address.';
  }
  if (code === 'auth/operation-not-allowed') {
    return 'Email/Password sign-in is not enabled in Firebase Console.';
  }
  if (code === 'auth/network-request-failed') {
    return 'Network request failed. Please check your internet connection.';
  }
  return msg;
}

export function LoginScreen(): React.JSX.Element {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    const trimmedEmail = email.trim();
    const trimmedPass = password.trim();
    if (!trimmedEmail || !trimmedPass) {
      setError('Please enter both email and password.');
      return;
    }
    setError(null);
    setBusy(true);
    try {
      if (mode === 'signin') {
        await signIn(trimmedEmail, trimmedPass);
      } else {
        await signUp(trimmedEmail, trimmedPass);
      }
    } catch (err: unknown) {
      setError(formatAuthError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={base.stack}
      >
        <View style={styles.header}>
          <Text style={styles.appBadge}>単語をキャッチする</Text>
          <Text style={base.title}>
            {mode === 'signin' ? 'Welcome back' : 'Create an account'}
          </Text>
          <Text style={base.caption}>
            {mode === 'signin'
              ? 'Sign in to access your saved words, places, and study progress.'
              : 'Sign up to keep your vocabulary synchronized across devices.'}
          </Text>
        </View>

        <Card>
          <Text style={base.label}>Email address</Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="name@example.com"
            placeholderTextColor={colors.textMuted}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            editable={!busy}
            style={styles.input}
          />

          <Text style={base.label}>Password</Text>
          <TextInput
            value={password}
            onChangeText={setPassword}
            placeholder="Password (minimum 6 characters)"
            placeholderTextColor={colors.textMuted}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            editable={!busy}
            style={styles.input}
          />

          {error ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <Button
            label={
              busy
                ? 'Signing in…'
                : mode === 'signin'
                ? 'Sign in'
                : 'Create account'
            }
            onPress={handleSubmit}
            disabled={busy}
            style={styles.submitBtn}
          />

          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={() => {
              setError(null);
              setMode(m => (m === 'signin' ? 'signup' : 'signin'));
            }}
            style={styles.switchMode}
          >
            <Text style={styles.switchModeText}>
              {mode === 'signin'
                ? "Don't have an account? Create one"
                : 'Already have an account? Sign in'}
            </Text>
          </Pressable>
        </Card>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    gap: space.xs,
    paddingVertical: space.md,
  },
  appBadge: {
    ...base.label,
    color: colors.accent,
    fontWeight: fontWeights.bold,
  },
  input: {
    ...base.text,
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.md,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    fontSize: fontSizes.md,
    marginBottom: space.sm,
  },
  errorBox: {
    backgroundColor: '#FDE8E8',
    borderColor: '#F8B4B4',
    borderWidth: sizes.hairline,
    borderRadius: radii.md,
    padding: space.sm,
    marginVertical: space.xs,
  },
  errorText: {
    ...base.caption,
    color: '#9B1C1C',
    fontWeight: fontWeights.medium,
  },
  submitBtn: {
    marginTop: space.sm,
  },
  switchMode: {
    alignItems: 'center',
    paddingVertical: space.sm,
  },
  switchModeText: {
    ...base.caption,
    color: colors.accent,
    fontWeight: fontWeights.bold,
  },
});
