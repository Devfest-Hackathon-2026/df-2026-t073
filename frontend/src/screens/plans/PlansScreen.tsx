import React, { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { deleteVisit, listVisits, searchPlaces } from '../../api/places';
import { Icon } from '../../components/Icon';
import { Jp } from '../../components/Jp';
import { Screen, ScreenHeader } from '../../components/layout';
import {
  Button,
  Card,
  IconButton,
  Loadable,
  SectionTitle,
} from '../../components/ui';
import { useAsync } from '../../hooks/useAsync';
import { useReloadOnFocus } from '../../hooks/useReloadOnFocus';
import { useRootNav } from '../../navigation/types';
import { useSettings } from '../../state/SettingsContext';
import { base } from '../../styles/base';
import { colors, radii, sizes, space } from '../../styles/tokens';
import { PlaceSearchResults } from '../../components/PlaceSearchResults';
import { formatVisitTime } from '../../utils/format';
import { copy } from '../../copy';
import { favoriteHearts } from '../../features/places/FavoriteHeart';
import { useFavoritePlaces } from '../../features/places/useFavoritePlaces';

export function PlansScreen(): React.JSX.Element {
  const nav = useRootNav();
  const favorites = useFavoritePlaces();
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
          en={copy.plans.title}
          jp={copy.plans.titleJp}
        />
      </ScreenHeader>
      {!settings.mapFeatures ? (
        <>
          <View style={styles.searchBox}>
            <Icon name="search" color={colors.textMuted} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder={copy.plans.searchPlaceholder}
              placeholderTextColor={colors.textMuted}
              style={styles.searchInput}
              accessibilityLabel={copy.plans.searchA11y}
            />
          </View>
          {query.trim() ? (
            <PlaceSearchResults
              places={results.data ?? []}
              loading={results.loading}
              onPick={place => {
                setQuery('');
                nav.navigate('Prepare', { placeId: place.id });
              }}
              renderTrailing={favoriteHearts(favorites)}
            />
          ) : null}
        </>
      ) : null}
      <Loadable state={visits}>
        {list => (
          <View style={base.stack}>
            {list.length === 0 ? (
              <Card>
                <Text style={base.caption}>{copy.plans.empty}</Text>
              </Card>
            ) : null}
            {list.map(visit => (
              <Card key={visit.id}>
                <View style={base.rowBetween}>
                  <Text style={base.label}>{formatVisitTime(visit.when)}</Text>
                  <IconButton
                    icon="close"
                    label={copy.plans.cancelVisit(visit.place.name.text)}
                    onPress={async () => {
                      try {
                        await deleteVisit(visit.id);
                        visits.reload();
                      } catch {
                        // ignore
                      }
                    }}
                  />
                </View>
                <View style={base.rowBetween}>
                  <View style={base.grow}>
                    <Jp {...visit.place.name} bold size="lg" />
                    <Text style={base.caption}>
                      {copy.plans.placeLine(
                        visit.place.category,
                        visit.place.area,
                        visit.tangoCount,
                      )}
                    </Text>
                  </View>
                  <Button
                    label={copy.plans.prepare}
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
