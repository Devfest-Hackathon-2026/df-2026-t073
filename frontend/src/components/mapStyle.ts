import type { MapStyleElement } from 'react-native-maps';
import { mapColors as c } from '../styles/tokens';

/**
 * Muted Google map style for Tankengo: neutral land, soft roads, no shop or
 * business pins, train lines and stations kept (they matter for "near the
 * station" Tango). Colors come from `mapColors` in tokens.ts.
 */
export const TANGO_MAP_STYLE: MapStyleElement[] = [
  { elementType: 'geometry', stylers: [{ color: c.land }] },
  { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: c.label }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: c.labelHalo }] },

  {
    featureType: 'administrative',
    elementType: 'geometry.stroke',
    stylers: [{ color: c.border }],
  },
  {
    featureType: 'administrative.land_parcel',
    stylers: [{ visibility: 'off' }],
  },
  {
    featureType: 'administrative.neighborhood',
    elementType: 'labels',
    stylers: [{ visibility: 'simplified' }],
  },

  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  {
    featureType: 'poi.park',
    elementType: 'geometry',
    stylers: [{ visibility: 'on' }, { color: c.park }],
  },

  {
    featureType: 'road',
    elementType: 'geometry.fill',
    stylers: [{ color: c.road }],
  },
  {
    featureType: 'road',
    elementType: 'geometry.stroke',
    stylers: [{ color: c.roadEdge }],
  },
  {
    featureType: 'road.highway',
    elementType: 'geometry.fill',
    stylers: [{ color: c.highway }],
  },
  {
    featureType: 'road.local',
    elementType: 'labels',
    stylers: [{ visibility: 'off' }],
  },
  {
    featureType: 'road',
    elementType: 'labels.icon',
    stylers: [{ visibility: 'off' }],
  },

  {
    featureType: 'transit.line',
    elementType: 'geometry',
    stylers: [{ color: c.rail }],
  },
  {
    featureType: 'transit.station',
    elementType: 'labels.icon',
    stylers: [{ visibility: 'on' }, { saturation: -60 }],
  },

  {
    featureType: 'water',
    elementType: 'geometry',
    stylers: [{ color: c.water }],
  },
];
