import type { MapStyleElement } from 'react-native-maps';
import { washiColors as w } from '../styles/tokens';

/**
 * "Washi": the Tankengo map. Warm paper, ink-blue water, soft parks, no shop
 * or transit icons, no street names; only neighborhood and station names, so
 * it reads as a learning map rather than a navigation app.
 */
export const WASHI_MAP_STYLE: MapStyleElement[] = [
  { elementType: 'geometry', stylers: [{ color: w.paper }] },
  { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: w.label }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: w.labelHalo }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  {
    featureType: 'poi.park',
    elementType: 'geometry',
    stylers: [{ visibility: 'on' }, { color: w.park }],
  },
  // Built-up land: at street zoom Google draws it grey whatever fill is set,
  // so hide it and let the paper show through (roads and parks stay).
  {
    featureType: 'landscape',
    elementType: 'geometry.fill',
    stylers: [{ color: w.paper }],
  },
  { featureType: 'landscape.man_made', stylers: [{ visibility: 'off' }] },
  {
    featureType: 'road',
    elementType: 'labels',
    stylers: [{ visibility: 'off' }],
  },
  {
    featureType: 'road',
    elementType: 'geometry',
    stylers: [{ color: w.road }],
  },
  {
    featureType: 'road.highway',
    elementType: 'geometry',
    stylers: [{ color: w.majorRoad }],
  },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  {
    featureType: 'transit.line',
    elementType: 'geometry',
    stylers: [{ visibility: 'on' }, { color: w.rail }],
  },
  {
    featureType: 'transit.station.rail',
    elementType: 'labels.text',
    stylers: [{ visibility: 'on' }],
  },
  {
    featureType: 'water',
    elementType: 'geometry',
    stylers: [{ color: w.water }],
  },
  {
    featureType: 'water',
    elementType: 'labels',
    stylers: [{ visibility: 'off' }],
  },
  {
    featureType: 'administrative',
    elementType: 'geometry',
    stylers: [{ visibility: 'off' }],
  },
  {
    featureType: 'administrative.locality',
    elementType: 'labels',
    stylers: [{ visibility: 'off' }],
  },
];

export const TANGO_MAP_STYLE = WASHI_MAP_STYLE;
