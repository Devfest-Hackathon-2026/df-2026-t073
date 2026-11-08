import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { getTodaysCatch } from '../../api/capture';
import { Icon } from '../../components/Icon';
import { Jp } from '../../components/Jp';
import { Screen, ScreenHeader } from '../../components/layout';
import { Button, Card, Chip, Loadable } from '../../components/ui';
import { useAsync } from '../../hooks/useAsync';
import { useReloadOnFocus } from '../../hooks/useReloadOnFocus';
import type { RootScreenProps } from '../../navigation/types';
import { base } from '../../styles/base';
import { colors, sizes, space } from '../../styles/tokens';

/** Shown while loading: build anticipation, not impatience. */
const CATCH_LINES = ["Counting today's catch…"];

/** Opened from the camera's counter: back returns to the camera. */
export function CaptureTodayScreen({
  navigation,
}: RootScreenProps<'CaptureToday'>): React.JSX.Element {
  const catches = useAsync(getTodaysCatch);
  useReloadOnFocus(catches.reload);

  return (
    <Screen
      footer={
        <Button
          label="Done"
          variant="dark"
          onPress={() => navigation.popToTop()}
        />
      }
    >
      <ScreenHeader onBack={() => navigation.goBack()} />
      <Loadable state={catches} messages={CATCH_LINES}>
        {list => {
          const places = new Set(
            list.map(entry => entry.placeName).filter(Boolean),
          ).size;
          return (
            <Card>
              <View style={base.rowBetween}>
                <Text style={base.heading}>Today's catch</Text>
                <Text style={base.caption}>
                  {list.length} Tango · {places} places
                </Text>
              </View>
              {list.length === 0 ? (
                <Text style={base.caption}>Nothing caught yet today.</Text>
              ) : null}
              {list.map((entry, i) => (
                <Pressable
                  key={`${entry.tango.id}-${i}`}
                  accessibilityRole="button"
                  accessibilityLabel={`Open ${entry.tango.text}`}
                  onPress={() =>
                    navigation.navigate('TangoDetail', { id: entry.tango.id })
                  }
                  style={styles.row}
                >
                  <View style={styles.word}>
                    <Jp {...entry.tango} bold size="lg" />
                  </View>
                  <Text style={[base.caption, base.grow]} numberOfLines={2}>
                    {[entry.tango.meaning, entry.placeName]
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                  <Chip
                    label={entry.status === 'new' ? 'New' : 'Reviewed'}
                    tone={entry.status === 'new' ? 'accent' : 'outline'}
                  />
                  <Icon name="forward" color={colors.textMuted} />
                </Pressable>
              ))}
            </Card>
          );
        }}
      </Loadable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingVertical: space.sm,
    borderBottomWidth: sizes.hairline,
    borderBottomColor: colors.border,
  },
  word: {
    maxWidth: '40%',
  },
});
