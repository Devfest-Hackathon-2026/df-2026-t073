import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { firebaseConfigured } from '../auth/firebase';
import { useProfileSync } from '../hooks/useProfileSync';
import { LoginScreen } from '../screens/auth/LoginScreen';
import { CaptureScreen } from '../screens/capture/CaptureScreen';
import { CaptureTodayScreen } from '../screens/capture/CaptureTodayScreen';
import { MeSectionScreen } from '../screens/me/MeSectionScreen';
import { PlansScreen } from '../screens/plans/PlansScreen';
import { PrepareScreen } from '../screens/prepare/PrepareScreen';
import { RehearseResultsScreen } from '../screens/rehearse/RehearseResultsScreen';
import { RehearseScreen } from '../screens/rehearse/RehearseScreen';
import { AllTangoScreen } from '../screens/review/AllTangoScreen';
import { ReviewSessionScreen } from '../screens/review/ReviewSessionScreen';
import { TangoListScreen } from '../screens/review/TangoListScreen';
import { TangoDetailScreen } from '../screens/tango/TangoDetailScreen';
import { WelcomeScreen } from '../screens/welcome/WelcomeScreen';
import { useAuth } from '../state/AuthContext';
import { useSettings } from '../state/SettingsContext';
import { base } from '../styles/base';
import { colors } from '../styles/tokens';
import { Tabs } from './Tabs';
import type { RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator(): React.JSX.Element {
  const { settings, ready: settingsReady } = useSettings();
  const { user, ready: authReady } = useAuth();
  useProfileSync();

  if (!settingsReady || !authReady) {
    return (
      <View style={[base.screen, base.content]}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {!settings.onboarded ? (
        <Stack.Screen name="Welcome" component={WelcomeScreen} />
      ) : !user && firebaseConfigured ? (
        <Stack.Screen name="Login" component={LoginScreen} />
      ) : (
        <>
          <Stack.Screen name="Tabs" component={Tabs} />
          <Stack.Screen name="Prepare" component={PrepareScreen} />
          <Stack.Screen name="Rehearse" component={RehearseScreen} />
          <Stack.Screen
            name="RehearseResults"
            component={RehearseResultsScreen}
          />
          <Stack.Screen
            name="Capture"
            component={CaptureScreen}
            options={{ presentation: 'fullScreenModal', animation: 'fade' }}
          />
          <Stack.Screen name="CaptureToday" component={CaptureTodayScreen} />
          <Stack.Screen name="TangoDetail" component={TangoDetailScreen} />
          <Stack.Screen name="ReviewSession" component={ReviewSessionScreen} />
          <Stack.Screen name="Plans" component={PlansScreen} />
          <Stack.Screen name="AllTango" component={AllTangoScreen} />
          <Stack.Screen name="TangoList" component={TangoListScreen} />
          <Stack.Screen name="MeSection" component={MeSectionScreen} />
        </>
      )}
    </Stack.Navigator>
  );
}
