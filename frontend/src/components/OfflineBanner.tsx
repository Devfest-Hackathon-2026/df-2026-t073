import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { copy } from '../copy';
import { useOnline } from '../hooks/useOnline';
import { base } from '../styles/base';
import { colors, fontSizes, radii, space } from '../styles/tokens';
import { Icon } from './Icon';

/** A small bar over the top of the app while it can't reach the server. */
export function OfflineBanner(): React.JSX.Element | null {
  const online = useOnline();
  const insets = useSafeAreaInsets();
  if (online) {
    return null;
  }
  return (
    <View
      style={[styles.wrap, { top: insets.top + space.xs }]}
      pointerEvents="none"
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
    >
      <View style={styles.banner}>
        <Icon name="offline" size={fontSizes.md} color={colors.textInverse} />
        <Text style={styles.text}>{copy.offline.banner}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: space.lg,
    right: space.lg,
    alignItems: 'center',
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    backgroundColor: colors.dark,
    borderRadius: radii.pill,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
  },
  text: {
    ...base.caption,
    color: colors.textInverse,
    flexShrink: 1,
  },
});
