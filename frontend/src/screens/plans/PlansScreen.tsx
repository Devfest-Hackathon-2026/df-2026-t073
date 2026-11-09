import React, { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { listVisits, searchPlaces } from '../../api/places';
import { Icon } from '../../components/Icon';
import { Jp } from '../../components/Jp';
import { Screen, ScreenHeader } from '../../components/layout';
import {
  Button,
  Card,
  Facts,
  Loadable,
  SectionTitle,
} from '../../components/ui';
import { useAsync } from '../../hooks/useAsync';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
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
import { PlanVisitSheet } from '../../features/plans/PlanVisitSheet';
import type { Visit } from '../../types';

/**
 * The user's planned visits. As a tab (when the map is off it takes the Map
 * tab's place) it has a page title instead of a back button.
 */
export function PlansScreen({
  asTab = false,
}: {
  asTab?: boolean;
}): React.JSX.Element {
  const nav = useRootNav();
  const favorites = useFavoritePlaces();
  const visits = useAsync(listVisits);
  useReloadOnFocus(visits.reload);
  // With the map off, place search lives here instead of on the Map tab.
  const { settings } = useSettings();
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<Visit | null>(null);
  const searchQuery = useDebouncedValue(query);
  const results = useAsync(() => searchPlaces(searchQuery), searchQuery);

  return (
    <Screen edges={asTab ? ['top'] : undefined}>
      {asTab ? (
        <SectionTitle
          en={copy.plans.title}
          jp={copy.plans.titleJp}
          size="title"
        />
      ) : (
        <ScreenHeader onBack={() => nav.goBack()}>
          <SectionTitle en={copy.plans.title} jp={copy.plans.titleJp} />
        </ScreenHeader>
      )}
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
              // Tapping a plan opens the plan sheet: change or remove it.
              <Card key={visit.id} onPress={() => setEditing(visit)}>
                <View style={base.rowBetween}>
                  <View style={[base.grow, styles.planBody]}>
                    <Jp {...visit.place.name} bold size="lg" furigana={false} />
                    <Facts
                      items={[
                        { icon: 'calendar', text: formatVisitTime(visit.when) },
                        { icon: 'category', text: visit.place.category },
                        { icon: 'pin', text: visit.place.area },
                        {
                          icon: 'tango',
                          text: copy.common.tangoCount(visit.tangoCount),
                        },
                      ]}
                    />
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
            <PlanVisitSheet
              visible={editing !== null}
              onClose={() => setEditing(null)}
              place={
                editing
                  ? { id: editing.place.id, name: editing.place.name.text }
                  : undefined
              }
              visits={list}
              onSaved={visits.reload}
            />
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
  planBody: {
    gap: space.xxs,
  },
});
