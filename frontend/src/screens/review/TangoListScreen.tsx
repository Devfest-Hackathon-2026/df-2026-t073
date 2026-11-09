import React, { useState } from 'react';
import { Alert, Text, View } from 'react-native';
import {
  deleteList,
  listCollectionId,
  listLists,
  updateList,
} from '../../api/lists';
import { listTango } from '../../api/tango';
import { Screen, ScreenHeader } from '../../components/layout';
import { Button, IconButton, Loadable } from '../../components/ui';
import { useAsync } from '../../hooks/useAsync';
import { useReloadOnFocus } from '../../hooks/useReloadOnFocus';
import type { RootScreenProps } from '../../navigation/types';
import { base } from '../../styles/base';
import { NameListSheet } from './ListSheets';
import { TangoRow } from './TangoRow';
import { copy } from '../../copy';

const LINES = copy.lists.loadingLines;

/** A user-made list: its Tango, rename, remove, review, delete. */
export function TangoListScreen({
  navigation,
  route,
}: RootScreenProps<'TangoList'>): React.JSX.Element {
  const { listId } = route.params;
  const data = useAsync(async () => {
    const [lists, tango] = await Promise.all([listLists(), listTango()]);
    const list = lists.find(l => l.id === listId);
    if (!list) {
      throw new Error(copy.lists.gone);
    }
    const byId = new Map(tango.map(t => [t.id, t]));
    return {
      list,
      items: list.tangoIds.flatMap(id => (byId.has(id) ? [byId.get(id)!] : [])),
    };
  }, listId);
  useReloadOnFocus(data.reload);
  const [renaming, setRenaming] = useState(false);

  const remove = async (id: string) => {
    await updateList(listId, { remove: [id] });
    data.reload();
  };
  const confirmDelete = (name: string) =>
    Alert.alert(copy.lists.deleteTitle(name), copy.lists.deleteBody, [
      { text: copy.common.cancel, style: 'cancel' },
      {
        text: copy.common.delete,
        style: 'destructive',
        onPress: async () => {
          await deleteList(listId);
          navigation.goBack();
        },
      },
    ]);

  return (
    <Screen
      footer={
        data.data && data.data.items.length > 0 ? (
          <Button
            label={copy.lists.reviewThisList}
            onPress={() =>
              navigation.navigate('ReviewSession', {
                collectionId: listCollectionId(listId),
              })
            }
          />
        ) : undefined
      }
    >
      <Loadable state={data} messages={LINES}>
        {({ list, items }) => (
          <View style={base.stack}>
            <ScreenHeader
              onBack={() => navigation.goBack()}
              right={
                <View style={base.row}>
                  <IconButton
                    icon="edit"
                    label={copy.lists.rename}
                    onPress={() => setRenaming(true)}
                  />
                  <IconButton
                    icon="delete"
                    label={copy.lists.deleteList}
                    onPress={() => confirmDelete(list.name)}
                  />
                </View>
              }
            >
              <Text style={base.title} numberOfLines={2}>
                {list.name}
              </Text>
            </ScreenHeader>
            <Text style={base.caption}>{copy.lists.count(items.length)}</Text>
            {items.length === 0 ? (
              <Text style={base.caption}>{copy.lists.empty}</Text>
            ) : null}
            {items.map(t => (
              <TangoRow
                key={t.id}
                tango={t}
                onPress={() => navigation.navigate('TangoDetail', { id: t.id })}
                action={
                  <IconButton
                    icon="remove"
                    label={copy.lists.remove(t.text)}
                    onPress={() => remove(t.id)}
                  />
                }
              />
            ))}
            <NameListSheet
              visible={renaming}
              initial={list.name}
              title={copy.lists.rename}
              onClose={() => setRenaming(false)}
              onSave={async name => {
                await updateList(listId, { name });
                data.reload();
              }}
            />
          </View>
        )}
      </Loadable>
    </Screen>
  );
}
