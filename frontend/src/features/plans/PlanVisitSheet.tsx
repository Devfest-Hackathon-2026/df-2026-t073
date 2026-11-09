import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { createVisit, deleteVisit } from '../../api/places';
import { BottomSheet } from '../../components/layout';
import { Button, Chip } from '../../components/ui';
import { copy } from '../../copy';
import { base } from '../../styles/base';
import { colors, space } from '../../styles/tokens';
import type { Visit } from '../../types';
import { formatVisitTime } from '../../utils/format';
import {
  dayOptions,
  defaultPick,
  isPast,
  planTime,
  slotLabel,
  TIME_SLOTS,
} from './planTimes';

/**
 * Plan a visit to one place: pick a day and a time of day.
 * With an existing plan, shows it with Change and Remove.
 */
export function PlanVisitSheet({
  visible,
  onClose,
  placeId,
  placeName,
  existing,
  onSaved,
}: {
  visible: boolean;
  onClose: () => void;
  placeId: string;
  placeName: string;
  /** The place's upcoming plan, if it has one. */
  existing: Visit | null;
  /** Called after a plan is added, changed or removed. */
  onSaved: () => void;
}): React.JSX.Element | null {
  const [now] = useState(() => new Date());
  const [changing, setChanging] = useState(false);
  const [pick, setPick] = useState(() => defaultPick(now));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Start fresh each time the sheet opens.
  useEffect(() => {
    if (visible) {
      setChanging(false);
      setPick(defaultPick(new Date()));
      setError(null);
    }
  }, [visible]);

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : copy.plans.couldNotSave);
    } finally {
      setBusy(false);
    }
  };

  // Changing a plan adds the new one before removing the old, so a failed
  // save never loses the plan the user already had.
  const save = () =>
    run(async () => {
      await createVisit(
        placeId,
        planTime(now, pick.offset, pick.slotId).toISOString(),
      );
      if (existing) {
        await deleteVisit(existing.id);
      }
    });

  const showPicker = !existing || changing;

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <View style={base.stack}>
        <Text style={base.heading}>{copy.plans.sheetTitle(placeName)}</Text>

        {showPicker ? (
          <>
            <Text style={base.label}>{copy.plans.day}</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.dayRow}
            >
              {dayOptions(now).map(day => (
                <Chip
                  key={day.offset}
                  label={day.label}
                  tone="outline"
                  selected={pick.offset === day.offset}
                  onPress={() => {
                    // Keep the time if it's still ahead on that day.
                    const slotId = isPast(now, day.offset, pick.slotId)
                      ? defaultPick(now).slotId
                      : pick.slotId;
                    setPick({ offset: day.offset, slotId });
                  }}
                />
              ))}
            </ScrollView>

            <Text style={base.label}>{copy.plans.time}</Text>
            <View style={base.wrap}>
              {TIME_SLOTS.filter(
                slot => !isPast(now, pick.offset, slot.id),
              ).map(slot => (
                <Chip
                  key={slot.id}
                  label={slotLabel(slot)}
                  tone="outline"
                  selected={pick.slotId === slot.id}
                  onPress={() => setPick({ ...pick, slotId: slot.id })}
                />
              ))}
            </View>

            <Button
              label={existing ? copy.plans.saveChange : copy.plans.addToPlans}
              icon="calendar"
              disabled={busy}
              onPress={save}
            />
          </>
        ) : (
          <>
            <Text style={base.text}>
              {copy.plans.planned(formatVisitTime(existing.when))}
            </Text>
            <View style={base.row}>
              <Button
                label={copy.plans.change}
                variant="secondary"
                style={base.grow}
                disabled={busy}
                onPress={() => setChanging(true)}
              />
              <Button
                label={copy.plans.remove}
                variant="ghost"
                style={base.grow}
                disabled={busy}
                onPress={() => run(() => deleteVisit(existing.id))}
              />
            </View>
          </>
        )}

        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  dayRow: {
    gap: space.sm,
  },
  error: {
    ...base.caption,
    color: colors.caution,
  },
});
