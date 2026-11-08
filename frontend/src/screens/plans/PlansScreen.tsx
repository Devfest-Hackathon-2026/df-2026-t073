import React, { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { listVisits, searchPlaces } from '../../api/places';
import { Icon } from '../../components/Icon';
import { Jp } from '../../components/Jp';
import { Screen, ScreenHeader } from '../../components/layout';
import { Button, Card, Loadable, SectionTitle } from '../../components/ui';
import { useAsync } from '../../hooks/useAsync';
import { useReloadOnFocus } from '../../hooks/useReloadOnFocus';
import { useRootNav } from '../../navigation/types';
import { useSettings } from '../../state/SettingsContext';
import { base } from '../../styles/base';
import { colors, radii, sizes, space } from '../../styles/tokens';
import { SearchResults } from '../map/MapScreen';
import { formatVisitTime } from '../../utils/format';

export function PlansScreen(): React.JSX.Element {
  const nav = useRootNav();
  const visits = useAsync(listVisits);
  useReloadOnFocus(visits.reload);
  // With the map off, place search lives here instead of on the Map tab.
  const { settings } = useSettings();
  const [query, setQuery] = useState('');
  const results = useAsync(() => searchPlaces(query), query);

  return (
    <Screen>
      <ScreenHeader onBack={() => nav.goBack()}>
        <SectionTitle
          en="Plans"
          jp={{ text: '予定', reading: 'よてい', romaji: 'yotei' }}
        />
      </ScreenHeader>
      {!settings.mapFeatures ? (
        <>
          <View style={styles.searchBox}>
            <Icon name="search" color={colors.textMuted} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="どこへ行く？"
              placeholderTextColor={colors.textMuted}
              style={styles.searchInput}
              accessibilityLabel="Search places to visit"
            />
          </View>
          {query.trim() ? (
            <SearchResults
              places={results.data ?? []}
              loading={results.loading}
              onPick={() => setQuery('')}
            />
          ) : null}
        </>
      ) : null}
      <Loadable state={visits}>
        {list => (
          <View style={base.stack}>
            {list.map(visit => (
              <Card key={visit.id}>
                <Text style={base.label}>{formatVisitTime(visit.when)}</Text>
                <View style={base.rowBetween}>
                  <View style={base.grow}>
                    <Jp {...visit.place.name} bold size="lg" />
                    <Text style={base.caption}>
                      {visit.place.category} · {visit.place.area} ·{' '}
                      {visit.tangoCount} Tango
                    </Text>
                  </View>
                  <Button
                    label="Prepare"
                    onPress={() =>
                      nav.navigate('Prepare', { placeId: visit.place.id })
                    }
                  />
                </View>
              </Card>
            ))}
          </View>
        )}
      </Loadable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    backgroundColor: colors.surface,
    borderRadius: radii.pill,
    borderWidth: sizes.hairline,
    borderColor: colors.border,
    paddingHorizontal: space.lg,
    minHeight: sizes.touch,
  },
  searchInput: {
    ...base.text,
    flex: 1,
    paddingVertical: 0,
  },
});
