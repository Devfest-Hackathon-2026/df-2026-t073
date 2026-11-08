import React, { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { listTango } from '../../api/tango';
import { Icon } from '../../components/Icon';
import { Screen, ScreenHeader } from '../../components/layout';
import { Loadable, SectionTitle } from '../../components/ui';
import { useAsync } from '../../hooks/useAsync';
import { useReloadOnFocus } from '../../hooks/useReloadOnFocus';
import type { RootScreenProps } from '../../navigation/types';
import { base } from '../../styles/base';
import { colors, radii, sizes, space } from '../../styles/tokens';
import { TangoRow } from './TangoRow';

const LINES = ['Laying out your Tango…'];

/** Every Tango, newest first, searchable by word, meaning or place. */
export function AllTangoScreen({
  navigation,
}: RootScreenProps<'AllTango'>): React.JSX.Element {
  const [query, setQuery] = useState('');
  const tango = useAsync(() => listTango(query), query);
  useReloadOnFocus(tango.reload);

  return (
    <Screen>
      <ScreenHeader onBack={() => navigation.goBack()}>
        <SectionTitle
          en="All Tango"
          jp={{ text: '単語', reading: 'たんご', romaji: 'tango' }}
        />
      </ScreenHeader>
      <View style={styles.search}>
        <Icon name="search" color={colors.textMuted} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search"
          placeholderTextColor={colors.textMuted}
          style={styles.input}
          accessibilityLabel="Search Tango or places"
        />
      </View>
      <Loadable state={tango} messages={LINES}>
        {list => (
          <View style={base.stackSm}>
            {list.length === 0 ? (
              <Text style={base.caption}>No matches</Text>
            ) : null}
            {list.map(t => (
              <TangoRow
                key={t.id}
                tango={t}
                onPress={() => navigation.navigate('TangoDetail', { id: t.id })}
              />
            ))}
          </View>
        )}
      </Loadable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  search: {
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
  input: {
    ...base.text,
    flex: 1,
    paddingVertical: 0,
  },
});
