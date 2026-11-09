import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Icon } from '../../components/Icon';
import { IconButton } from '../../components/ui';
import { copy } from '../../copy';
import { base } from '../../styles/base';
import {
  colors,
  fontSizes,
  fontWeights,
  radii,
  sizes,
  space,
} from '../../styles/tokens';
import { pad } from '../../utils/format';
import {
  addMonths,
  isPastDay,
  monthWeeks,
  type PlanPick,
  stepHour,
  stepMinute,
} from './planTimes';

/** A month calendar. Past days can't be picked; today has a ring. */
export function CalendarMonth({
  now,
  value,
  onChange,
}: {
  now: Date;
  value: PlanPick;
  onChange: (pick: PlanPick) => void;
}): React.JSX.Element {
  const [shown, setShown] = useState({ year: value.year, month: value.month });
  // Follow the picked month when it changes from outside (sheet reopened).
  useEffect(() => {
    setShown({ year: value.year, month: value.month });
  }, [value.year, value.month]);

  const isThisMonth =
    shown.year === now.getFullYear() && shown.month === now.getMonth();
  const monthName = copy.common.months[shown.month];

  return (
    <View style={styles.calendar}>
      <View style={base.rowBetween}>
        {isThisMonth ? (
          <View style={styles.navSpacer} />
        ) : (
          <IconButton
            icon="back"
            label={copy.plans.previousMonth}
            onPress={() => setShown(addMonths(shown.year, shown.month, -1))}
          />
        )}
        <Text style={styles.monthLabel}>
          {copy.plans.monthLabel(monthName, shown.year)}
        </Text>
        <IconButton
          icon="forward"
          label={copy.plans.nextMonth}
          onPress={() => setShown(addMonths(shown.year, shown.month, 1))}
        />
      </View>
      <View style={styles.week}>
        {copy.common.weekdays.map(day => (
          <Text key={day} style={styles.weekday}>
            {day}
          </Text>
        ))}
      </View>
      {monthWeeks(shown.year, shown.month).map((week, w) => (
        <View key={w} style={styles.week}>
          {week.map((date, d) => {
            if (date === null) {
              return <View key={d} style={styles.cell} />;
            }
            const past = isPastDay(now, shown.year, shown.month, date);
            const selected =
              value.year === shown.year &&
              value.month === shown.month &&
              value.date === date;
            const today = isThisMonth && date === now.getDate();
            return (
              <View key={d} style={styles.cell}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={copy.plans.dayA11y(
                    copy.common.weekdays[d],
                    date,
                    monthName,
                  )}
                  accessibilityState={{ selected, disabled: past }}
                  disabled={past}
                  onPress={() =>
                    onChange({
                      ...value,
                      year: shown.year,
                      month: shown.month,
                      date,
                    })
                  }
                  style={[
                    styles.day,
                    today && styles.dayToday,
                    selected && styles.daySelected,
                  ]}
                >
                  <Text
                    style={[
                      styles.dayText,
                      past && styles.dayTextPast,
                      selected && styles.dayTextSelected,
                    ]}
                  >
                    {date}
                  </Text>
                </Pressable>
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

/** Hour and minute, each with up and down buttons. */
export function TimePicker({
  value,
  onChange,
}: {
  value: PlanPick;
  onChange: (pick: PlanPick) => void;
}): React.JSX.Element {
  return (
    <View style={styles.time}>
      <Spinner
        unit={copy.plans.hour}
        text={String(value.hour)}
        onStep={delta => onChange(stepHour(value, delta))}
      />
      <Text style={styles.timeValue}>:</Text>
      <Spinner
        unit={copy.plans.minute}
        text={pad(value.minute)}
        onStep={delta => onChange(stepMinute(value, delta))}
      />
    </View>
  );
}

function Spinner({
  unit,
  text,
  onStep,
}: {
  unit: string;
  text: string;
  onStep: (delta: number) => void;
}): React.JSX.Element {
  return (
    <View style={styles.spinner}>
      <StepButton
        icon="up"
        label={copy.plans.later(unit)}
        onPress={() => onStep(1)}
      />
      <Text style={styles.timeValue} accessibilityLabel={`${unit} ${text}`}>
        {text}
      </Text>
      <StepButton
        icon="down"
        label={copy.plans.earlier(unit)}
        onPress={() => onStep(-1)}
      />
    </View>
  );
}

function StepButton({
  icon,
  label,
  onPress,
}: {
  icon: 'up' | 'down';
  label: string;
  onPress: () => void;
}): React.JSX.Element {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={styles.stepButton}
    >
      <Icon name={icon} color={colors.text} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  calendar: {
    gap: space.xxs,
  },
  navSpacer: {
    width: sizes.touch,
  },
  monthLabel: {
    ...base.text,
    fontWeight: fontWeights.bold,
  },
  week: {
    flexDirection: 'row',
  },
  weekday: {
    ...base.label,
    flex: 1,
    textAlign: 'center',
  },
  cell: {
    flex: 1,
    alignItems: 'center',
  },
  day: {
    width: sizes.touch,
    height: sizes.touch,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayToday: {
    borderWidth: sizes.hairline,
    borderColor: colors.border,
  },
  daySelected: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  dayText: {
    ...base.text,
  },
  dayTextPast: {
    color: colors.border,
  },
  dayTextSelected: {
    color: colors.textInverse,
    fontWeight: fontWeights.bold,
  },
  time: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.md,
  },
  spinner: {
    alignItems: 'center',
  },
  stepButton: {
    width: sizes.touch,
    height: sizes.touch,
    borderRadius: radii.pill,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timeValue: {
    ...base.text,
    fontSize: fontSizes.xxl,
    fontWeight: fontWeights.bold,
    minWidth: sizes.touch,
    textAlign: 'center',
  },
});
