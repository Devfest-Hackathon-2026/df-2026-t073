import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput } from 'react-native';
import { createList, listLists, updateList } from '../../api/lists';
import { Icon } from '../../components/Icon';
import { BottomSheet } from '../../components/layout';
import { Button } from '../../components/ui';
import { base } from '../../styles/base';
import { colors, radii, sizes, space } from '../../styles/tokens';
import type { TangoList } from '../../types';

/** Name a new list (or rename one). */
export function NameListSheet({
  visible,
  initial = '',
  title,
  onClose,
  onSave,
}: {
  visible: boolean;
  initial?: string;
  title: string;
  onClose: () => void;
  onSave: (name: string) => Promise<void>;
}): React.JSX.Element | null {
  const [name, setName] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (visible) {
      setName(initial);
      setError(null);
    }
  }, [visible, initial]);
  const save = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      return;
    }
    try {
      await onSave(trimmed);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save');
    }
  };
  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <Text style={base.heading}>{title}</Text>
      <TextInput
        value={name}
        onChangeText={setName}
        onSubmitEditing={save}
        placeholder="e.g. Ramen shop words"
        placeholderTextColor={colors.textMuted}
        maxLength={40}
        autoFocus
        returnKeyType="done"
        style={styles.input}
        accessibilityLabel="List name"
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Button label="Save" icon="done" onPress={save} />
    </BottomSheet>
  );
}

/** Add one Tango to an existing list, or to a new one. */
export function AddToListSheet({
  visible,
  tangoId,
  onClose,
}: {
  visible: boolean;
  tangoId: string;
  onClose: () => void;
}): React.JSX.Element | null {
  const [lists, setLists] = useState<TangoList[] | null>(null);
  const [naming, setNaming] = useState(false);
  useEffect(() => {
    if (visible) {
      listLists()
        .then(setLists)
        .catch(() => setLists([]));
    }
  }, [visible]);

  const toggle = async (list: TangoList) => {
    const inList = list.tangoIds.includes(tangoId);
    const updated = await updateList(
      list.id,
      inList ? { remove: [tangoId] } : { add: [tangoId] },
    );
    setLists(prev =>
      (prev ?? []).map(l => (l.id === updated.id ? updated : l)),
    );
  };

  return (
    <>
      <BottomSheet visible={visible && !naming} onClose={onClose}>
        <Text style={base.heading}>Add to a list</Text>
        {(lists ?? []).map(list => {
          const inList = list.tangoIds.includes(tangoId);
          return (
            <Pressable
              key={list.id}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: inList }}
              onPress={() => toggle(list)}
              style={styles.listRow}
            >
              <Text style={[base.text, base.grow]} numberOfLines={1}>
                {list.name}
              </Text>
              <Text style={base.caption}>{list.tangoIds.length}</Text>
              <Icon
                name={inList ? 'done' : 'add'}
                color={inList ? colors.accent : colors.textMuted}
              />
            </Pressable>
          );
        })}
        <Button
          label="New list"
          icon="addToList"
          variant="secondary"
          onPress={() => setNaming(true)}
        />
      </BottomSheet>
      <NameListSheet
        visible={visible && naming}
        title="New list"
        onClose={() => setNaming(false)}
        onSave={async name => {
          const created = await createList(name, [tangoId]);
          setLists(prev => [...(prev ?? []), created]);
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  input: {
    ...base.text,
    backgroundColor: colors.bg,
    borderRadius: radii.md,
    borderWidth: sizes.hairline,
    borderColor: colors.border,
    paddingHorizontal: space.md,
    minHeight: sizes.touch,
  },
  error: {
    ...base.caption,
    color: colors.caution,
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.sm,
    borderBottomWidth: sizes.hairline,
    borderBottomColor: colors.border,
  },
});
