import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PanResponder, StyleSheet, View } from 'react-native';
import { colors, radii, sizes } from '../../styles/tokens';
import type { NormalizedBox } from '../../types';
import { copy } from '../../copy';

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const MIN_SIZE = sizes.touch;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Manual fallback box on a frozen frame. Drag the box to move it, drag the
 * bottom-right handle to resize. Reports the area in normalized coordinates.
 */
export function SelectionBox({
  width,
  height,
  initial,
  onChange,
}: {
  width: number;
  height: number;
  initial: NormalizedBox;
  onChange: (box: NormalizedBox) => void;
}): React.JSX.Element {
  const [rect, setRect] = useState<Rect>(() => ({
    x: initial.x * width,
    y: initial.y * height,
    w: initial.w * width,
    h: initial.h * height,
  }));
  const rectRef = useRef(rect);
  const startRef = useRef(rect);
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });

  const apply = useCallback(
    (next: Rect) => {
      rectRef.current = next;
      setRect(next);
      onChangeRef.current({
        x: next.x / width,
        y: next.y / height,
        w: next.w / width,
        h: next.h / height,
      });
    },
    [width, height],
  );

  const moveResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onPanResponderGrant: () => {
          startRef.current = rectRef.current;
        },
        onPanResponderMove: (_event, gesture) => {
          const start = startRef.current;
          apply({
            ...start,
            x: clamp(start.x + gesture.dx, 0, width - start.w),
            y: clamp(start.y + gesture.dy, 0, height - start.h),
          });
        },
      }),
    [apply, width, height],
  );

  const resizeResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: () => {
          startRef.current = rectRef.current;
        },
        onPanResponderMove: (_event, gesture) => {
          const start = startRef.current;
          apply({
            ...start,
            w: clamp(start.w + gesture.dx, MIN_SIZE, width - start.x),
            h: clamp(start.h + gesture.dy, MIN_SIZE, height - start.y),
          });
        },
      }),
    [apply, width, height],
  );

  return (
    <View
      style={[styles.box, { left: rect.x, top: rect.y, width: rect.w, height: rect.h }]}
      accessibilityLabel={copy.capture.selectionBoxA11y}
      {...moveResponder.panHandlers}
    >
      <View style={styles.handle} {...resizeResponder.panHandlers} />
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    position: 'absolute',
    borderWidth: sizes.border,
    borderColor: colors.surface,
    borderRadius: radii.sm,
  },
  handle: {
    position: 'absolute',
    right: -sizes.handle / 2,
    bottom: -sizes.handle / 2,
    width: sizes.handle,
    height: sizes.handle,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    borderWidth: sizes.border,
    borderColor: colors.accent,
  },
});
