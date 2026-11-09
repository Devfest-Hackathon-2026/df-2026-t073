import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  DefaultTheme,
  NavigationContainer,
  type NavigationState,
} from '@react-navigation/native';
import React, { useEffect, useState } from 'react';
import { Linking, StatusBar } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { linking } from './src/navigation/linking';
import { RootNavigator } from './src/navigation/RootNavigator';
import { AuthProvider } from './src/state/AuthContext';
import { SettingsProvider } from './src/state/SettingsContext';
import { colors } from './src/styles/tokens';

const theme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: colors.accent,
    background: colors.bg,
    card: colors.surface,
    text: colors.text,
    border: colors.border,
  },
};

/** Development only: where you were, so a reload doesn't reset to Home. */
const NAV_STATE_KEY = 'dev.navigationState';

/**
 * In development, the screen you were on before a reload (not when the app
 * was opened from a link). Ready right away in release builds.
 */
function useDevNavigationState() {
  const [ready, setReady] = useState(!__DEV__);
  const [initialState, setInitialState] = useState<NavigationState>();
  useEffect(() => {
    if (!__DEV__) {
      return;
    }
    (async () => {
      try {
        if (!(await Linking.getInitialURL())) {
          const saved = await AsyncStorage.getItem(NAV_STATE_KEY);
          if (saved) {
            setInitialState(JSON.parse(saved));
          }
        }
      } catch {
        // Start from Home.
      } finally {
        setReady(true);
      }
    })();
  }, []);
  const save = (state: NavigationState | undefined) => {
    if (__DEV__ && state) {
      AsyncStorage.setItem(NAV_STATE_KEY, JSON.stringify(state)).catch(
        () => {},
      );
    }
  };
  return { ready, initialState, save };
}

function App(): React.JSX.Element {
  const nav = useDevNavigationState();
  if (!nav.ready) {
    return <></>;
  }
  return (
    <SafeAreaProvider>
      <StatusBar barStyle="dark-content" />
      <AuthProvider>
        <SettingsProvider>
          <NavigationContainer
            theme={theme}
            linking={linking}
            initialState={nav.initialState}
            onStateChange={nav.save}
          >
            <RootNavigator />
          </NavigationContainer>
        </SettingsProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}

export default App;
