import { Platform } from 'react-native';

// Design tokens. Placeholder values until the style guide is final.
// Every color, font and size in the app comes from this file.

export const colors = {
  // Neutrals
  bg: '#F2F2EF',
  surface: '#FFFFFF',
  surfaceMuted: '#E7E7E3',
  border: '#D4D4CF',
  text: '#1B1B1B',
  textMuted: '#6A6A66',
  textInverse: '#FFFFFF',
  dark: '#1B1B1B',
  /** The card peeking out behind the ink Review card (the Review deck). */
  deckBack: '#3B4A66',
  camera: '#202326',
  scrim: 'rgba(0, 0, 0, 0.4)',
  overlay: 'rgba(0, 0, 0, 0.65)',
  // Light fills and lines on dark cards
  inverseSoft: 'rgba(255, 255, 255, 0.08)',
  inverseBorder: 'rgba(255, 255, 255, 0.3)',
  // The one accent: red pen, a shade deeper than the 花丸 red so white text
  // on it stays readable.
  accent: '#C2302B',
  accentSoft: '#F9E3E1',
  // Ink navy: the Up next card, so red stays for actions.
  ink: '#22304A',
  // Status (kept minimal)
  positive: '#2E7A4F',
  caution: '#A35C00',
  // 花丸 (mastered Tango): a teacher's red pen.
  hanamaru: '#D2452B',
} as const;

// Android bundles Murecho (res/font, registered in MainApplication.kt). iOS
// keeps the system font until the font is added to the iOS project too.
export const fonts = {
  body: Platform.select({ android: 'Murecho', default: 'System' }),
  mono: Platform.select({ android: 'monospace', default: 'Menlo' }),
} as const;

export const fontWeights = {
  regular: '400',
  medium: '500',
  bold: '700',
} as const;

export const fontSizes = {
  xs: 11,
  sm: 13,
  md: 15,
  lg: 18,
  xl: 22,
  xxl: 28,
  jumbo: 44,
} as const;

export const space = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radii = {
  sm: 8,
  md: 12,
  lg: 18,
  /** Buttons are fully round, like pills. */
  button: 999,
  pill: 999,
} as const;

/** Fixed component sizes. */
export const sizes = {
  hairline: 1,
  border: 2,
  touch: 44,
  icon: 20,
  tabBar: 64,
  captureTab: 56,
  shutter: 72,
  mic: 72,
  pin: 24,
  mapHeight: 220,
  strengthSegment: 8,
  dot: 2,
  handle: 22,
  /** The hanamaru at the end of a strength bar. */
  seal: 22,
} as const;

export const tracking = {
  wide: 0.8,
} as const;

export const opacity = {
  pressed: 0.6,
  faded: 0.45,
} as const;

/** Google map style colors: warm land with white roads, clear parks, water and rail. */

/** "Washi" map: ink on paper, so the map reads as Tankengo, not Google Maps. */
export const washiColors = {
  paper: '#F4EFE4',
  park: '#E1E5CF',
  water: '#C3D3DC',
  road: '#FBF8F2',
  majorRoad: '#E8DECB',
  rail: '#CDBFA6',
  label: '#7A705F',
  labelHalo: '#F4EFE4',
} as const;
