import { NavigationContainer } from '@react-navigation/native';
import React from 'react';
import { Text } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Tabs } from '../src/navigation/Tabs';
import { SettingsProvider, useSettings } from '../src/state/SettingsContext';

// Only the tab bar matters here; keep the screens empty.
jest.mock('../src/screens/today/TodayScreen', () => ({
  TodayScreen: () => null,
}));
jest.mock('../src/screens/map/MapScreen', () => ({ MapScreen: () => null }));
jest.mock('../src/screens/review/ReviewScreen', () => ({
  ReviewScreen: () => null,
}));
jest.mock('../src/screens/me/MeScreen', () => ({ MeScreen: () => null }));
jest.mock('../src/screens/plans/PlansScreen', () => ({
  PlansScreen: () => null,
}));

function MapSetting({
  on,
  children,
}: {
  on: boolean;
  children: React.ReactNode;
}) {
  const { settings, ready, update } = useSettings();
  // Re-apply after saved settings load, which can overwrite an earlier update.
  React.useEffect(() => {
    if (ready && settings.mapFeatures !== on) {
      update({ mapFeatures: on });
    }
  }, [ready, settings.mapFeatures, on, update]);
  return settings.mapFeatures === on ? <>{children}</> : null;
}

async function tabLabels(mapOn: boolean) {
  let tree!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    tree = ReactTestRenderer.create(
      <SafeAreaProvider
        initialMetrics={{
          frame: { x: 0, y: 0, width: 390, height: 844 },
          insets: { top: 0, left: 0, right: 0, bottom: 0 },
        }}
      >
        <SettingsProvider>
          <MapSetting on={mapOn}>
            <NavigationContainer>
              <Tabs />
            </NavigationContainer>
          </MapSetting>
        </SettingsProvider>
      </SafeAreaProvider>,
    );
  });
  // Let saved settings load and the map setting apply.
  for (let i = 0; i < 3; i++) {
    await ReactTestRenderer.act(async () => {});
  }
  const labels = tree.root
    .findAllByType(Text)
    .map(n => [n.props.children].flat().join(''));
  await ReactTestRenderer.act(async () => tree.unmount());
  return labels;
}

test('with the map on: Home, Map, camera, Tango, Me', async () => {
  expect(await tabLabels(true)).toEqual(['Home', 'Map', 'My Tango', 'Me']);
});

test('with the map off, Plans takes the Map slot so the camera stays centered', async () => {
  expect(await tabLabels(false)).toEqual(['Home', 'Plans', 'My Tango', 'Me']);
});
