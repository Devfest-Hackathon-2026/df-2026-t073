import type { MapStyleElement } from 'react-native-maps';
import { mapColors as c, paleDawnColors as pd } from '../styles/tokens';

/**
 * Minimal Google map style for Tankengo (concept slide 5): warm land, roads
 * as white lines (thin for side streets), train lines as the one accent,
 * parks and water as flat shapes, and no Google labels (area names are
 * drawn by TangoMap under the pins). Colors come from `mapColors` in tokens.ts.
 */
/** Line widths (Google style weight units). */
const ROAD_WEIGHT = { highway: 3, arterial: 2, local: 0.8, rail: 1 };

export const MINIMAL_MAP_STYLE: MapStyleElement[] = [
  // Start from nothing: hide every feature and label, then add back a few.
  { stylers: [{ visibility: 'off' }] },
  // Labels on roads, transit and places don't follow the rule above reliably.
  {
    featureType: 'road',
    elementType: 'labels',
    stylers: [{ visibility: 'off' }],
  },
  {
    featureType: 'transit',
    elementType: 'labels',
    stylers: [{ visibility: 'off' }],
  },
  {
    featureType: 'poi',
    elementType: 'labels',
    stylers: [{ visibility: 'off' }],
  },

  // Land
  {
    featureType: 'landscape',
    elementType: 'geometry',
    stylers: [{ visibility: 'on' }, { color: c.land }],
  },

  // Parks and water as flat shapes
  {
    featureType: 'poi.park',
    elementType: 'geometry',
    stylers: [{ visibility: 'on' }, { color: c.park }],
  },
  {
    featureType: 'water',
    elementType: 'geometry',
    stylers: [{ visibility: 'on' }, { color: c.water }],
  },

  // Roads as white lines on darker land; wider for bigger roads.
  {
    featureType: 'road.highway',
    elementType: 'geometry.fill',
    stylers: [
      { visibility: 'on' },
      { color: c.road },
      { weight: ROAD_WEIGHT.highway },
    ],
  },
  {
    featureType: 'road.arterial',
    elementType: 'geometry.fill',
    stylers: [
      { visibility: 'on' },
      { color: c.road },
      { weight: ROAD_WEIGHT.arterial },
    ],
  },
  {
    featureType: 'road.local',
    elementType: 'geometry.fill',
    stylers: [
      { visibility: 'on' },
      { color: c.road },
      { weight: ROAD_WEIGHT.local },
    ],
  },

  // Train lines: the one accent
  {
    featureType: 'transit.line',
    elementType: 'geometry',
    stylers: [
      { visibility: 'on' },
      { color: c.rail },
      { weight: ROAD_WEIGHT.rail },
    ],
  },
  // No Google labels at all: area names are drawn under our own pins.
];

/**
 * "Pale Dawn" by Snazzy Maps (https://snazzymaps.com/style/1/pale-dawn):
 * warm beige land, sage parks, grey-blue water, Google labels kept.
 */
export const PALE_DAWN_MAP_STYLE: MapStyleElement[] = [
  {
    featureType: 'administrative',
    elementType: 'all',
    stylers: [{ visibility: 'on' }, { lightness: 33 }],
  },
  {
    featureType: 'landscape',
    elementType: 'all',
    stylers: [{ color: pd.land }],
  },
  {
    featureType: 'poi.park',
    elementType: 'geometry',
    stylers: [{ color: pd.park }],
  },
  {
    featureType: 'poi.park',
    elementType: 'labels',
    stylers: [{ visibility: 'on' }, { lightness: 20 }],
  },
  { featureType: 'road', elementType: 'all', stylers: [{ lightness: 20 }] },
  {
    featureType: 'road.highway',
    elementType: 'geometry',
    stylers: [{ color: pd.highway }],
  },
  {
    featureType: 'road.arterial',
    elementType: 'geometry',
    stylers: [{ color: pd.arterial }],
  },
  {
    featureType: 'road.local',
    elementType: 'geometry',
    stylers: [{ color: pd.local }],
  },
  {
    featureType: 'water',
    elementType: 'all',
    stylers: [{ visibility: 'on' }, { color: pd.water }],
  },
];

/** The style the app uses. Switch here to compare. */
export const TANGO_MAP_STYLE = PALE_DAWN_MAP_STYLE;
