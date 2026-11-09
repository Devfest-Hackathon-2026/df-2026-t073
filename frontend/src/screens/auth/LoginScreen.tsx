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
import { useSettings } from '../../state/SettingsContext';
import { base } from '../../styles/base';
import {
  colors,
  fontSizes,
  fontWeights,
  radii,
  sizes,
  space,
} from '../../styles/tokens';
import { copy } from '../../copy';

function formatAuthError(err: unknown): string {
  if (!err) {
    return copy.login.unknownError;
  }
  const msg = err instanceof Error ? err.message : String(err);
  const code = (err as { code?: string })?.code;

  if (
    code === 'auth/user-not-found' ||
    code === 'auth/wrong-password' ||
    code === 'auth/invalid-credential' ||
    code === 'auth/invalid-login-credentials'
  ) {
    return copy.login.wrongCredentials;
  }
  if (code === 'auth/email-already-in-use') {
    return copy.login.emailInUse;
  }
  if (code === 'auth/account-exists-with-different-credential') {
    return copy.login.accountExistsOtherMethod;
  }
  if (code === 'auth/weak-password') {
    return copy.login.weakPassword;
  }
  if (code === 'auth/invalid-email') {
    return copy.login.invalidEmail;
  }
  if (code === 'auth/operation-not-allowed') {
    return copy.login.signInDisabled;
  }
  if (code === 'auth/network-request-failed') {
    return copy.login.networkFailed;
  }
  return msg;
}

export function LoginScreen(): React.JSX.Element {
  const { signIn, signUp, signInWithGoogle } = useAuth();
  const { update } = useSettings();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    const trimmedEmail = email.trim();
    const trimmedPass = password.trim();
    if (!trimmedEmail || !trimmedPass) {
      setError(copy.login.missingFields);
      return;
    }
    setError(null);
    setBusy(true);
    try {
      if (mode === 'signin') {
        await signIn(trimmedEmail, trimmedPass);
      } else {
        await signUp(trimmedEmail, trimmedPass);
        update({ dayOne: true });
      }
    } catch (err: unknown) {
      setError(formatAuthError(err));
    } finally {
      setBusy(false);
    }
  };

  const handleGoogle = async () => {
    setError(null);
    setBusy(true);
    try {
      await signInWithGoogle();
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
          <Text style={styles.appBadge}>{copy.login.badge}</Text>
          <Text style={base.title}>
            {mode === 'signin'
              ? copy.login.welcomeBack
              : copy.login.createAccountTitle}
          </Text>
          <Text style={base.caption}>
            {mode === 'signin'
              ? copy.login.signInBody
              : copy.login.signUpBody}
          </Text>
        </View>

        <Card>
          <Text style={base.label}>{copy.login.email}</Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder={copy.login.emailPlaceholder}
            placeholderTextColor={colors.textMuted}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            editable={!busy}
            style={styles.input}
          />

          <Text style={base.label}>{copy.login.password}</Text>
          <TextInput
            value={password}
            onChangeText={setPassword}
            placeholder={copy.login.passwordPlaceholder}
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
                ? copy.login.signingIn
                : mode === 'signin'
                ? copy.login.signIn
                : copy.login.createAccount
            }
            onPress={handleSubmit}
            disabled={busy}
            style={styles.submitBtn}
          />

          <Text style={styles.orText}>{copy.login.or}</Text>

          <Button
            label={copy.login.continueWithGoogle}
            variant="secondary"
            onPress={handleGoogle}
            disabled={busy}
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
                ? copy.login.toSignUp
                : copy.login.toSignIn}
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
  orText: {
    ...base.caption,
    textAlign: 'center',
    marginVertical: space.sm,
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
