import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { getTodaysCatch } from '../../api/capture';
import { Jp } from '../../components/Jp';
import { Screen, ScreenHeader } from '../../components/layout';
import { Button, Card, Chip, Loadable } from '../../components/ui';
import { useAsync } from '../../hooks/useAsync';
import type { RootScreenProps } from '../../navigation/types';
import { base } from '../../styles/base';
import { colors, sizes, space } from '../../styles/tokens';

export function CaptureTodayScreen({
  navigation,
}: RootScreenProps<'CaptureToday'>): React.JSX.Element {
  const catches = useAsync(getTodaysCatch);

  const keepScanning = () => {
    const routes = navigation.getState().routes;
    const previous = routes[routes.length - 2];
    if (previous?.name === 'Capture') {
      navigation.goBack();
    } else {
      navigation.replace('Capture');
    }
  };

  return (
    <Screen
      footer={
        <View style={base.row}>
          <Button
            label="Keep scanning"
            variant="secondary"
            style={base.grow}
            onPress={keepScanning}
          />
          <Button
            label="Done"
            variant="dark"
            style={base.grow}
            onPress={() => navigation.popToTop()}
          />
        </View>
      }
    >
      <ScreenHeader onBack={() => navigation.goBack()} />
      <Loadable state={catches}>
        {list => {
          const places = new Set(list.map(entry => entry.placeName)).size;
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
                <View key={`${entry.tango.id}-${i}`} style={styles.row}>
                  <View style={styles.word}>
                    <Jp {...entry.tango} bold size="lg" />
                  </View>
                  <Text
                    style={[base.caption, base.grow]}
                    onPress={() =>
                      navigation.navigate('TangoDetail', { id: entry.tango.id })
                    }
                  >
                    {entry.tango.meaning} · {entry.placeName}
                  </Text>
                  <Chip
                    label={entry.status === 'new' ? 'New' : 'Reviewed'}
                    tone={entry.status === 'new' ? 'accent' : 'outline'}
                  />
                </View>
              ))}
              <Text style={base.caption}>
                New Tango join your review tonight, pinned to where you found them.
              </Text>
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
    gap: space.md,
    paddingVertical: space.sm,
    borderBottomWidth: sizes.hairline,
    borderBottomColor: colors.border,
  },
  word: {
    minWidth: space.xxl * 3,
  },
});
