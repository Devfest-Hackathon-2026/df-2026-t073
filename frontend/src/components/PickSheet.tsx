import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { Icon } from './Icon';
import { BottomSheet } from './layout';
import { base } from '../styles/base';
import { colors, sizes, space } from '../styles/tokens';

export interface PickOption<K extends string> {
  key: K;
  label: string;
  /** e.g. how many Tango a place has. */
  count?: number;
}

/** A sheet with a list of choices; picking one closes it. */
export function PickSheet<K extends string>({
  visible,
  title,
  options,
  value,
  onPick,
  onClose,
}: {
  visible: boolean;
  title: string;
  options: PickOption<K>[];
  value: K;
  onPick: (key: K) => void;
  onClose: () => void;
}): React.JSX.Element {
  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <Text style={base.heading}>{title}</Text>
      <ScrollView style={styles.options}>
        {options.map(option => (
          <Pressable
            key={option.key}
            accessibilityRole="radio"
            accessibilityState={{ checked: value === option.key }}
            onPress={() => {
              onPick(option.key);
              onClose();
            }}
            style={styles.row}
          >
            <Text style={[base.text, base.grow]} numberOfLines={1}>
              {option.label}
            </Text>
            {option.count !== undefined ? (
              <Text style={base.caption}>{option.count}</Text>
            ) : null}
            <Icon
              name="done"
              color={value === option.key ? colors.accent : 'transparent'}
            />
          </Pressable>
        ))}
      </ScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  // Long lists (many places) scroll inside the sheet.
  options: {
    maxHeight: sizes.touch * 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: sizes.touch,
    borderBottomWidth: sizes.hairline,
    borderBottomColor: colors.border,
  },
});
