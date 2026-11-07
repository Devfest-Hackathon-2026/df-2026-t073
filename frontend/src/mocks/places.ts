import type { MapPin, Place, Visit } from '../types';

export const PLACES: Record<string, Place> = {
  'menya-taiki': {
    id: 'menya-taiki',
    name: {
      text: '麺屋 たいき',
      reading: 'めんや たいき',
      romaji: "men'ya taiki",
      meaning: 'Menya Taiki (ramen shop)',
    },
    category: 'Ramen',
    area: 'Koenji',
    lat: 35.7058,
    lng: 139.6497,
    note: '6 min walk from the station',
  },
  'koenji-station': {
    id: 'koenji-station',
    name: {
      text: '高円寺駅 北口',
      reading: 'こうえんじえき きたぐち',
      romaji: 'kōenji-eki kitaguchi',
      meaning: 'Koenji Station, North Exit',
    },
    category: 'Station',
    area: 'Koenji',
    lat: 35.7052,
    lng: 139.6497,
  },
  'nakano-supermarket': {
    id: 'nakano-supermarket',
    name: {
      text: 'スーパー 中野',
      reading: 'すーぱー なかの',
      romaji: 'sūpā nakano',
      meaning: 'Supermarket, Nakano',
    },
    category: 'Supermarket',
    area: 'Nakano',
    lat: 35.7074,
    lng: 139.6659,
  },
  'nakano-ward-office': {
    id: 'nakano-ward-office',
    name: {
      text: '中野区役所',
      reading: 'なかのくやくしょ',
      romaji: 'nakano kuyakusho',
      meaning: 'Nakano Ward Office',
    },
    category: 'Government office',
    area: 'Nakano',
    lat: 35.7078,
    lng: 139.6638,
    note: '4 min walk from Nakano Station',
  },
  'asagaya-pearl': {
    id: 'asagaya-pearl',
    name: {
      text: '阿佐谷パールセンター',
      reading: 'あさがやぱーるせんたー',
      romaji: 'asagaya pāru sentā',
      meaning: 'Asagaya Pearl Center (shopping street)',
    },
    category: 'Shopping street',
    area: 'Asagaya',
    lat: 35.7044,
    lng: 139.6359,
  },
  'penguin-enclosure': {
    id: 'penguin-enclosure',
    name: {
      text: 'ペンギン水槽',
      reading: 'ぺんぎんすいそう',
      romaji: 'pengin suisō',
      meaning: 'Penguin enclosure',
    },
    category: 'Aquarium',
    area: 'Oshiage',
    lat: 35.7101,
    lng: 139.8107,
  },
};

export const VISITS: Visit[] = [
  {
    id: 'visit-1',
    place: PLACES['menya-taiki'],
    when: '2026-11-08T12:15:00+09:00',
    tangoCount: 4,
  },
  {
    id: 'visit-2',
    place: PLACES['nakano-ward-office'],
    when: '2026-11-12T10:00:00+09:00',
    tangoCount: 6,
  },
];

export const MAP_PINS: MapPin[] = [
  { id: 'pin-koenji', label: 'Koenji', count: 12, x: 0.2, y: 0.32, kind: 'tango', areaId: 'koenji', stars: 3 },
  { id: 'pin-nakano', label: 'Nakano', count: 9, x: 0.66, y: 0.36, kind: 'tango', areaId: 'nakano', stars: 2 },
  { id: 'pin-asagaya', label: 'Asagaya', count: 6, x: 0.08, y: 0.68, kind: 'tango', areaId: 'asagaya', stars: 1 },
  { id: 'pin-other', label: '', count: 4, x: 0.86, y: 0.62, kind: 'tango', areaId: 'nakano' },
  { id: 'pin-next', label: 'Up next', count: 0, x: 0.36, y: 0.5, kind: 'next' },
  { id: 'pin-me', label: '', count: 0, x: 0.5, y: 0.78, kind: 'me' },
];

export const USER_NAME = 'Marcus';
