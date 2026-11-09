import { StyleSheet } from 'react-native';
import {
  colors,
  fontSizes,
  fontWeights,
  fonts,
  radii,
  sizes,
  space,
  tracking,
} from './tokens';

// Shared layout primitives. Components combine these with their own
// StyleSheet, always using token values.
export const base = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    padding: space.lg,
    gap: space.md,
  },
  stack: {
    gap: space.md,
  },
  stackSm: {
    gap: space.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
  },
  wrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
  },
  // minWidth 0 lets long text inside wrap instead of pushing siblings off screen.
  grow: {
    flex: 1,
    minWidth: 0,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: sizes.hairline,
    borderColor: colors.border,
    padding: space.lg,
    gap: space.sm,
  },
  button: {
    minHeight: sizes.touch,
    paddingHorizontal: space.lg,
    borderRadius: radii.button,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
    borderRadius: radii.pill,
    backgroundColor: colors.surfaceMuted,
    maxWidth: '100%',
  },
  text: {
    fontFamily: fonts.body,
    fontSize: fontSizes.md,
    color: colors.text,
  },
  title: {
    fontFamily: fonts.body,
    fontSize: fontSizes.xxl,
    fontWeight: fontWeights.bold,
    color: colors.text,
  },
  heading: {
    fontFamily: fonts.body,
    fontSize: fontSizes.lg,
    fontWeight: fontWeights.bold,
    color: colors.text,
  },
  caption: {
    fontFamily: fonts.body,
    fontSize: fontSizes.sm,
    color: colors.textMuted,
  },
  label: {
    fontFamily: fonts.body,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.bold,
    color: colors.textMuted,
    letterSpacing: tracking.wide,
    textTransform: 'uppercase',
  },
  divider: {
    height: sizes.hairline,
    backgroundColor: colors.border,
  },
});
