import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Hanamaru } from '../../components/Hanamaru';
import { Icon } from '../../components/Icon';
import { Jp } from '../../components/Jp';
import {
  Facts,
  StrengthBar,
} from '../../components/ui';
import { base } from '../../styles/base';
import { colors, fontSizes, radii, sizes, space } from '../../styles/tokens';
import type { Tango } from '../../types';
import { copy } from '../../copy';

/** One Tango in a list: word, meaning, strength; optional trailing action. */
export function TangoRow({
  tango,
  onPress,
  action,
}: {
  tango: Tango;
  onPress: () => void;
  /** e.g. a remove button on a list screen. */
  action?: React.ReactNode;
}): React.JSX.Element {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={copy.common.open(tango.text)}
      onPress={onPress}
      style={styles.row}
    >
      <View style={base.grow}>
        <View style={base.row}>
          <Jp {...tango} bold size="lg" />
          {tango.known ? <Hanamaru size={fontSizes.md} /> : null}
          {tango.favorite ? (
            <Icon
              name="heart"
              size={fontSizes.sm}
              color={colors.hanamaru}
              filled
            />
          ) : null}
        </View>
        <Text style={base.caption} numberOfLines={1}>
          {tango.meaning}
        </Text>
        <Facts items={[{ icon: 'pin', text: tango.sightings[0]?.placeName }]} />
      </View>
      <View style={styles.strength}>
        <StrengthBar strength={tango.strength} />
      </View>
      {action}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    padding: space.md,
  },
  strength: {
    width: sizes.mapHeight / 3,
  },
});
