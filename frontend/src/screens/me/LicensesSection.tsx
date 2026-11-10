import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Icon } from '../../components/Icon';
import { Card } from '../../components/ui';
import { copy } from '../../copy';
import { LICENSE_TEXTS, LICENSES } from '../../legal/licenses.generated';
import { base } from '../../styles/base';
import { colors, fontSizes, sizes, space } from '../../styles/tokens';

/** Open-source licenses for the packages, font and artwork the app ships. */
export function LicensesSection(): React.JSX.Element {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <View style={base.stack}>
      <Text style={base.caption}>{copy.licenses.intro}</Text>
      <Card>
        {LICENSES.map((entry, i) => {
          const key = `${entry.name}@${entry.version}`;
          const isOpen = open === key;
          return (
            <View key={key} style={i > 0 && styles.divider}>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded: isOpen }}
                accessibilityLabel={copy.licenses.rowA11y(
                  entry.name,
                  entry.license,
                )}
                onPress={() => setOpen(isOpen ? null : key)}
                style={styles.row}
              >
                <View style={base.grow}>
                  <Text style={styles.name}>{entry.name}</Text>
                  <Text style={base.caption}>
                    {entry.version
                      ? copy.licenses.versionLicense(
                          entry.version,
                          entry.license,
                        )
                      : entry.license}
                  </Text>
                </View>
                <Icon
                  name={isOpen ? 'up' : 'down'}
                  size={fontSizes.md}
                  color={colors.textMuted}
                />
              </Pressable>
              {isOpen ? (
                <Text style={styles.text} selectable>
                  {LICENSE_TEXTS[entry.text]}
                </Text>
              ) : null}
            </View>
          );
        })}
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: sizes.touch,
    paddingVertical: space.xs,
  },
  divider: {
    borderTopWidth: sizes.hairline,
    borderTopColor: colors.border,
  },
  name: {
    ...base.text,
  },
  text: {
    ...base.caption,
    fontSize: fontSizes.xs,
    paddingBottom: space.md,
  },
});
