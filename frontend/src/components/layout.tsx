// Screen scaffolding: safe-area screen, header, map placeholder, sheet, toast.
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { type Edge, SafeAreaView } from 'react-native-safe-area-context';
import { base } from '../styles/base';
import {
  colors,
  fontSizes,
  fontWeights,
  radii,
  sizes,
  space,
} from '../styles/tokens';
import type { MapPin } from '../types';
import { IconButton } from './ui';

// ---------- Screen ----------

export function Screen({
  children,
  scroll = true,
  footer,
  edges = ['top', 'bottom'],
}: {
  children: React.ReactNode;
  scroll?: boolean;
  /** Pinned under the scroll area (e.g. a main action button). */
  footer?: React.ReactNode;
  edges?: Edge[];
}): React.JSX.Element {
  return (
    <SafeAreaView style={base.screen} edges={edges}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={base.content}
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[base.grow, base.content]}>{children}</View>
      )}
      {footer ? <View style={styles.footer}>{footer}</View> : null}
    </SafeAreaView>
  );
}

// ---------- Header with back / close ----------

export function ScreenHeader({
  onBack,
  close = false,
  children,
  right,
}: {
  onBack: () => void;
  /** ✕ instead of ‹ */
  close?: boolean;
  children?: React.ReactNode;
  right?: React.ReactNode;
}): React.JSX.Element {
  return (
    <View style={styles.header}>
      <IconButton
        glyph={close ? '✕' : '‹'}
        label={close ? 'Close' : 'Back'}
        onPress={onBack}
      />
      <View style={styles.headerCenter}>{children}</View>
      <View style={styles.headerSide}>{right}</View>
    </View>
  );
}

// ---------- Map placeholder (no map SDK in this pass) ----------

export function MapPlaceholder({
  pins = [],
  height = sizes.mapHeight,
  full = false,
  showStars = false,
  onPinPress,
  children,
}: {
  pins?: MapPin[];
  height?: number;
  /** Fill the parent edge to edge (Today screen) instead of a fixed-height card. */
  full?: boolean;
  /** Show mastered-Tango counts (★) on pins instead of totals. */
  showStars?: boolean;
  onPinPress?: (pin: MapPin) => void;
  children?: React.ReactNode;
}): React.JSX.Element {
  return (
    <View
      style={full ? [styles.map, styles.mapFull] : [styles.map, { height }]}
      accessibilityLabel="Map placeholder"
    >
      <View style={styles.mapRoadH} />
      <View style={styles.mapRoadV} />
      <View style={styles.mapRail} />
      <Text style={styles.mapLabel}>Map placeholder</Text>
      {pins.map(pin => (
        <Pressable
          key={pin.id}
          accessibilityLabel={`${pin.label || 'Pin'} ${pin.count || ''}`}
          onPress={onPinPress ? () => onPinPress(pin) : undefined}
          style={[
            styles.pin,
            pinStyles[pin.kind],
            { left: `${pin.x * 100}%` as const, top: `${pin.y * 100}%` as const },
          ]}
        >
          {pin.kind === 'tango' ? (
            <Text style={styles.pinText}>
              {showStars ? `★${pin.stars ?? 0}` : pin.count}
            </Text>
          ) : null}
          {pin.kind === 'next' ? <Text style={styles.pinText}>{pin.label}</Text> : null}
        </Pressable>
      ))}
      {children}
    </View>
  );
}

const pinStyles = StyleSheet.create({
  tango: { backgroundColor: colors.dark },
  next: {
    backgroundColor: colors.accent,
    width: undefined,
    paddingHorizontal: space.sm,
  },
  me: {
    backgroundColor: colors.accent,
    borderWidth: sizes.border * 2,
    borderColor: colors.accentSoft,
  },
});

// ---------- Bottom sheet (in-screen overlay) ----------

export function BottomSheet({
  visible,
  onClose,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
}): React.JSX.Element | null {
  if (!visible) {
    return null;
  }
  return (
    <View style={StyleSheet.absoluteFill}>
      <Pressable
        style={styles.sheetScrim}
        onPress={onClose}
        accessibilityLabel="Close"
      />
      <View style={styles.sheet}>
        <View style={styles.sheetHandle} />
        <ScrollView contentContainerStyle={base.stack}>{children}</ScrollView>
      </View>
    </View>
  );
}

// ---------- Toast ----------

export function Toast({
  message,
  actions,
}: {
  message: React.ReactNode;
  actions?: { label: string; onPress: () => void }[];
}): React.JSX.Element {
  return (
    <View style={styles.toast}>
      <View style={base.grow}>{message}</View>
      {actions?.map(action => (
        <Pressable
          key={action.label}
          accessibilityRole="button"
          onPress={action.onPress}
          style={styles.toastAction}
        >
          <Text style={styles.toastActionText}>{action.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  footer: {
    paddingHorizontal: space.lg,
    paddingBottom: space.lg,
    paddingTop: space.sm,
    gap: space.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  headerSide: {
    minWidth: sizes.touch,
    alignItems: 'flex-end',
  },
  map: {
    borderRadius: radii.lg,
    backgroundColor: colors.surfaceMuted,
    overflow: 'hidden',
  },
  mapFull: {
    flex: 1,
    borderRadius: 0,
  },
  mapRoadH: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '55%',
    height: space.md,
    backgroundColor: colors.surface,
  },
  mapRoadV: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: '35%',
    width: space.md,
    backgroundColor: colors.surface,
  },
  mapRail: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '22%',
    borderTopWidth: sizes.border,
    borderStyle: 'dashed',
    borderColor: colors.accent,
  },
  mapLabel: {
    ...base.caption,
    position: 'absolute',
    right: space.sm,
    bottom: space.sm,
  },
  pin: {
    position: 'absolute',
    minWidth: sizes.pin,
    height: sizes.pin,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.xs,
  },
  pinText: {
    ...base.text,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.bold,
    color: colors.textInverse,
  },
  sheetScrim: {
    flex: 1,
    backgroundColor: colors.scrim,
  },
  sheet: {
    maxHeight: '75%',
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    padding: space.lg,
    paddingTop: space.sm,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: sizes.touch,
    height: space.xs,
    borderRadius: radii.pill,
    backgroundColor: colors.border,
    marginBottom: space.md,
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    padding: space.md,
  },
  toastAction: {
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
  },
  toastActionText: {
    ...base.text,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.bold,
    color: colors.accent,
  },
});
