import React from 'react';
import { Text, View } from 'react-native';
import { listVisits } from '../../api/places';
import { Jp } from '../../components/Jp';
import { Screen } from '../../components/layout';
import { Button, Card, Loadable, SectionTitle } from '../../components/ui';
import { useAsync } from '../../hooks/useAsync';
import { useRootNav } from '../../navigation/types';
import { base } from '../../styles/base';
import { formatVisitTime } from '../../utils/format';

export function PlansScreen(): React.JSX.Element {
  const nav = useRootNav();
  const visits = useAsync(listVisits);

  return (
    <Screen edges={['top']}>
      <SectionTitle
        en="Plans"
        jp={{ text: '予定', reading: 'よてい', romaji: 'yotei' }}
        size="title"
      />
      <Text style={base.caption}>
        Upcoming visits. Search a place on Today to add one.
      </Text>
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
                    onPress={() => nav.navigate('Prepare', { placeId: visit.place.id })}
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
