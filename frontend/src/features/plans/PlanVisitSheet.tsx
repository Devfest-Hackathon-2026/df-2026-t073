import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { createVisit, deleteVisit, searchPlaces } from '../../api/places';
import { Icon } from '../../components/Icon';
import { PlaceSearchResults } from '../../components/PlaceSearchResults';
import { BottomSheet } from '../../components/layout';
import { Button, Chip } from '../../components/ui';
import { copy } from '../../copy';
import { base } from '../../styles/base';
import { colors, radii, sizes, space } from '../../styles/tokens';
import { useAsync } from '../../hooks/useAsync';
import type { Visit } from '../../types';
import { formatVisitTime } from '../../utils/format';
import { CalendarMonth, TimePicker } from './DateTimePicker';
import {
  defaultPick,
  fromDate,
  isPast,
  pickLabel,
  slotLabel,
  TIME_SLOTS,
  toDate,
} from './planTimes';

/** The place a visit is planned for. */
export interface PlanPlace {
  id: string;
  name: string;
}

/**
 * Plan a visit: pick a date on a calendar and a time (5-minute steps, with
 * quick picks). Without a `place`, it starts with a place search. If the place
 * already has a plan, shows it with Change and Remove.
 */
export function PlanVisitSheet({
  visible,
  onClose,
  place,
  visits,
  onSaved,
}: {
  visible: boolean;
  onClose: () => void;
  /** The place to plan for; omit to let the user search for one. */
  place?: PlanPlace;
  /** The user's upcoming plans, to find one for the chosen place. */
  visits: Visit[];
  /** Called after a plan is added, changed or removed. */
  onSaved: () => void;
}): React.JSX.Element | null {
  const [now] = useState(() => new Date());
  const [chosen, setChosen] = useState<PlanPlace | null>(place ?? null);
  const [query, setQuery] = useState('');
  // Only search once something is typed.
  const results = useAsync(
    () => (query.trim() ? searchPlaces(query) : Promise.resolve([])),
    query,
  );
  const [changing, setChanging] = useState(false);
  const [pick, setPick] = useState(() => defaultPick(now));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Start fresh each time the sheet opens. (Callers often pass a new `place`
  // object on every render, so this depends on its id and name, not the object.)
  const placeId = place?.id;
  const placeName = place?.name;
  useEffect(() => {
    if (visible) {
      setChosen(placeId && placeName ? { id: placeId, name: placeName } : null);
      setQuery('');
      setChanging(false);
      setPick(defaultPick(new Date()));
      setError(null);
    }
  }, [visible, placeId, placeName]);

  const existing = chosen
    ? visits.find(v => v.place.id === chosen.id) ?? null
    : null;

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
  const save = (target: PlanPlace) =>
    run(async () => {
      await createVisit(target.id, toDate(pick).toISOString());
      if (existing) {
        await deleteVisit(existing.id);
      }
    });

  const showPicker = !existing || changing;
  const past = isPast(now, pick);

  // Changing starts from the plan's own date and time, if still ahead.
  const startChange = (visit: Visit) => {
    const current = fromDate(new Date(visit.when));
    setPick(isPast(now, current) ? defaultPick(now) : current);
    setChanging(true);
  };

  if (!chosen) {
    return (
      <BottomSheet visible={visible} onClose={onClose}>
        <View style={base.stack}>
          <Text style={base.heading}>{copy.plans.planVisit}</Text>
          <View style={styles.searchBox}>
            <Icon name="search" color={colors.textMuted} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder={copy.plans.searchPlaceholder}
              placeholderTextColor={colors.textMuted}
              style={styles.searchInput}
              autoFocus
              accessibilityLabel={copy.plans.searchA11y}
            />
          </View>
          {query.trim() ? (
            <PlaceSearchResults
              places={results.data ?? []}
              loading={results.loading}
              onPick={p => setChosen({ id: p.id, name: p.name.text })}
            />
          ) : null}
        </View>
      </BottomSheet>
    );
  }

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <View style={base.stack}>
        <Text style={base.heading}>{copy.plans.sheetTitle(chosen.name)}</Text>
        {place ? null : (
          <Text
            accessibilityRole="button"
            style={styles.link}
            onPress={() => setChosen(null)}
          >
            {copy.plans.otherPlace}
          </Text>
        )}

        {showPicker ? (
          <>
            <Text style={base.label}>{copy.plans.date}</Text>
            <CalendarMonth now={now} value={pick} onChange={setPick} />

            <Text style={base.label}>{copy.plans.time}</Text>
            <TimePicker value={pick} onChange={setPick} />
            <View style={styles.slots}>
              {TIME_SLOTS.filter(
                slot => !isPast(now, { ...pick, hour: slot.hour, minute: 0 }),
              ).map(slot => (
                <Chip
                  key={slot.id}
                  label={slotLabel(slot)}
                  tone="outline"
                  selected={pick.hour === slot.hour && pick.minute === 0}
                  onPress={() =>
                    setPick({ ...pick, hour: slot.hour, minute: 0 })
                  }
                />
              ))}
            </View>

            <Text style={[base.heading, styles.summary]}>
              {pickLabel(pick)}
            </Text>
            {past ? (
              <Text style={styles.error}>{copy.plans.pastTime}</Text>
            ) : null}
            <Button
              label={existing ? copy.plans.saveChange : copy.plans.addToPlans}
              icon="calendar"
              disabled={busy || past}
              onPress={() => save(chosen)}
            />
          </>
        ) : (
          <>
            <View>
              <Text style={base.label}>{copy.plans.planned}</Text>
              <Text style={base.heading}>{formatVisitTime(existing.when)}</Text>
            </View>
            <View style={base.row}>
              <Button
                label={copy.plans.change}
                variant="secondary"
                style={base.grow}
                disabled={busy}
                onPress={() => startChange(existing)}
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
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    backgroundColor: colors.bg,
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
  link: {
    ...base.caption,
    color: colors.accent,
  },
  slots: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: space.sm,
  },
  summary: {
    textAlign: 'center',
  },
  error: {
    ...base.caption,
    color: colors.caution,
  },
});
