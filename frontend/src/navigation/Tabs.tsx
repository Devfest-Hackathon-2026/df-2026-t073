import {
  type BottomTabBarProps,
  createBottomTabNavigator,
} from '@react-navigation/bottom-tabs';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MeScreen } from '../screens/me/MeScreen';
import { PlansScreen } from '../screens/plans/PlansScreen';
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
import type { TabParamList } from './types';

const Tab = createBottomTabNavigator<TabParamList>();

const TAB_META: Record<keyof TabParamList, { label: string; glyph: string }> = {
  Today: { label: 'Today', glyph: '⌂' },
  Plans: { label: 'Plans', glyph: '▦' },
  CaptureTab: { label: 'Capture', glyph: '◉' },
  Review: { label: 'Review', glyph: '❐' },
  Me: { label: 'Me', glyph: '☺' },
};

function EmptyScreen(): null {
  return null;
}

function TabBar({ state, navigation }: BottomTabBarProps): React.JSX.Element {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.bar, { paddingBottom: insets.bottom }]}>
      {state.routes.map((route, index) => {
        const name = route.name as keyof TabParamList;
        const meta = TAB_META[name];
        const focused = state.index === index;

        if (name === 'CaptureTab') {
          return (
            <View key={route.key} style={styles.item}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Open camera"
                onPress={() => navigation.getParent()?.navigate('Capture')}
                style={styles.capture}
              >
                <Text style={styles.captureGlyph}>{meta.glyph}</Text>
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
            <Text style={[styles.glyph, focused && styles.active]}>{meta.glyph}</Text>
            <Text style={[styles.label, focused && styles.active]}>{meta.label}</Text>
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
  return (
    <Tab.Navigator
      tabBar={renderTabBar}
      screenOptions={{ headerShown: false }}
    >
      <Tab.Screen name="Today" component={TodayScreen} />
      <Tab.Screen name="Plans" component={PlansScreen} />
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
  glyph: {
    ...base.text,
    fontSize: fontSizes.lg,
    color: colors.textMuted,
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
  captureGlyph: {
    fontSize: fontSizes.xl,
    color: colors.textInverse,
  },
});
