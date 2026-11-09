import {
  type BottomTabBarProps,
  createBottomTabNavigator,
} from '@react-navigation/bottom-tabs';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MeScreen } from '../screens/me/MeScreen';
import { MapScreen } from '../screens/map/MapScreen';
import { ReviewScreen } from '../screens/review/ReviewScreen';
import { TodayScreen } from '../screens/today/TodayScreen';
import { base } from '../styles/base';
import {
  colors,
  fontSizes,
  fontWeights,
  radii,
  sizes,
  space,
} from '../styles/tokens';
import { Icon, type IconName } from '../components/Icon';
import { useSettings } from '../state/SettingsContext';
import type { TabParamList } from './types';
import { copy } from '../copy';

const Tab = createBottomTabNavigator<TabParamList>();

const TAB_META: Record<keyof TabParamList, { label: string; icon: IconName }> =
  {
    Today: { label: copy.tabs.today, icon: 'home' },
    Map: { label: copy.tabs.map, icon: 'map' },
    CaptureTab: { label: copy.tabs.capture, icon: 'camera' },
    Review: { label: copy.tabs.review, icon: 'review' },
    Me: { label: copy.tabs.me, icon: 'me' },
  };

function EmptyScreen(): null {
  return null;
}

function TabBar({ state, navigation }: BottomTabBarProps): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const { settings } = useSettings();
  return (
    <View style={[styles.bar, { paddingBottom: insets.bottom }]}>
      {state.routes.map((route, index) => {
        const name = route.name as keyof TabParamList;
        const meta = TAB_META[name];
        const focused = state.index === index;

        if (name === 'CaptureTab') {
          if (!settings.mapFeatures) {
            return (
              <React.Fragment key={route.key}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={copy.tabs.openCamera}
                  onPress={() => navigation.getParent()?.navigate('Capture')}
                  style={styles.item}
                >
                  <Icon
                    name={meta.icon}
                    size={fontSizes.xl}
                    color={colors.textMuted}
                  />
                  <Text style={styles.label}>{meta.label}</Text>
                </Pressable>
              </React.Fragment>
            );
          }
          return (
            <View key={route.key} style={styles.item}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={copy.tabs.openCamera}
                onPress={() => navigation.getParent()?.navigate('Capture')}
                style={styles.capture}
              >
                <Icon
                  name={meta.icon}
                  size={fontSizes.xl}
                  color={colors.textInverse}
                />
              </Pressable>
            </View>
          );
        }

        const onPress = () => {
          const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          });
          if (!focused && !event.defaultPrevented) {
            navigation.navigate(route.name, route.params);
          }
        };

        return (
          <Pressable
            key={route.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
            onPress={onPress}
            style={styles.item}
          >
            <Icon
              name={meta.icon}
              size={fontSizes.xl}
              color={focused ? colors.accent : colors.textMuted}
              strokeWidth={focused ? 2.4 : 2}
            />
            <Text style={[styles.label, focused && styles.active]}>
              {meta.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function renderTabBar(props: BottomTabBarProps): React.JSX.Element {
  return <TabBar {...props} />;
}

export function Tabs(): React.JSX.Element {
  const { settings } = useSettings();
  return (
    <Tab.Navigator tabBar={renderTabBar} screenOptions={{ headerShown: false }}>
      <Tab.Screen name="Today" component={TodayScreen} />
      {settings.mapFeatures ? (
        <Tab.Screen name="Map" component={MapScreen} />
      ) : null}
      <Tab.Screen name="CaptureTab" component={EmptyScreen} />
      <Tab.Screen name="Review" component={ReviewScreen} />
      <Tab.Screen name="Me" component={MeScreen} />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderTopWidth: sizes.hairline,
    borderTopColor: colors.border,
    minHeight: sizes.tabBar,
  },
  item: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: space.sm,
  },
  label: {
    ...base.text,
    fontSize: fontSizes.xs,
    color: colors.textMuted,
  },
  active: {
    color: colors.accent,
    fontWeight: fontWeights.bold,
  },
  capture: {
    width: sizes.captureTab,
    height: sizes.captureTab,
    borderRadius: radii.pill,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -space.xl,
  },
});
