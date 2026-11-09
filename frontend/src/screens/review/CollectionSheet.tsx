import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Icon } from '../../components/Icon';
import { Jp } from '../../components/Jp';
import { BottomSheet } from '../../components/layout';
import { Button } from '../../components/ui';
import { copy } from '../../copy';
import { base } from '../../styles/base';
import { colors, sizes, space } from '../../styles/tokens';
import type { Collection, Tango } from '../../types';

/**
 * A collection's Tango, with a button to practice them. `tango` is null when
 * the app can't list them (Place cue: whatever is due now).
 */
export function CollectionSheet({
  collection,
  tango,
  onClose,
  onPractice,
  onOpenTango,
  onEditList,
}: {
  collection: Collection | null;
  tango: Tango[] | null;
  onClose: () => void;
  onPractice: () => void;
  onOpenTango: (id: string) => void;
  /** Only for user-made lists. */
  onEditList?: () => void;
}): React.JSX.Element {
  return (
    <BottomSheet visible={!!collection} onClose={onClose}>
      {collection ? (
        <>
          <View>
            <Text style={base.heading}>{collection.label}</Text>
            <Text style={base.caption}>
              {copy.common.tangoCount(collection.count)}
            </Text>
          </View>
          {tango === null ? (
            <Text style={base.text}>{copy.review.placeCueAbout}</Text>
          ) : tango.length === 0 ? (
            <Text style={base.caption}>{copy.review.collectionEmpty}</Text>
          ) : (
            <ScrollView style={styles.list}>
              {tango.map(t => (
                <Pressable
                  key={t.id}
                  accessibilityRole="button"
                  accessibilityLabel={copy.common.open(t.text)}
                  onPress={() => onOpenTango(t.id)}
                  style={styles.row}
                >
                  <View style={base.grow}>
                    <Jp {...t} bold oneLine />
                    <Text style={base.caption} numberOfLines={1}>
                      {t.meaning}
                    </Text>
                  </View>
                  <Icon name="forward" color={colors.textMuted} />
                </Pressable>
              ))}
            </ScrollView>
          )}
          <Button
            label={copy.review.practice}
            disabled={collection.count === 0}
            onPress={onPractice}
          />
          {onEditList ? (
            <Button
              label={copy.review.editList}
              icon="edit"
              variant="secondary"
              onPress={onEditList}
            />
          ) : null}
        </>
      ) : null}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  // Long collections scroll inside the sheet.
  list: {
    maxHeight: sizes.touch * 7,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.sm,
    borderBottomWidth: sizes.hairline,
    borderBottomColor: colors.border,
  },
});
