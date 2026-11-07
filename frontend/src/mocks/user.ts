import type { JpText, UserProfile } from '../types';
import { USER_NAME } from './places';

export const PROFILE: UserProfile = {
  name: USER_NAME,
  levelNote: 'Learning Japanese in Tokyo · around N5',
  stats: { tango: 38, stars: 11, places: 9 },
};

/** Tango a first-time user will likely see around Koenji Station. */
export const STARTER_TANGO: JpText[] = [
  { text: '出口', reading: 'でぐち', romaji: 'deguchi', meaning: 'exit' },
  { text: '改札', reading: 'かいさつ', romaji: 'kaisatsu', meaning: 'ticket gate' },
  { text: '禁煙', reading: 'きんえん', romaji: 'kin-en', meaning: 'no smoking' },
  { text: '営業中', reading: 'えいぎょうちゅう', romaji: 'eigyōchū', meaning: 'open' },
];
