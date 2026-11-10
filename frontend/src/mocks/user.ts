import type { JpText, UserProfile } from '../types';
import { USER_NAME } from './places';

export const PROFILE: UserProfile = {
  name: USER_NAME,
  levelNote: 'Reads hiragana and katakana',
  stats: { tango: 38, stars: 11, places: 9 },
};

/** Sample Tango for a first-time user: two signs, a food and an expression. */
export const STARTER_TANGO: JpText[] = [
  { text: '出口', reading: 'でぐち', romaji: 'deguchi', meaning: 'exit' },
  {
    text: '営業中',
    reading: 'えいぎょうちゅう',
    romaji: 'eigyōchū',
    meaning: 'open',
  },
  {
    text: '定食',
    reading: 'ていしょく',
    romaji: 'teishoku',
    meaning: 'set meal',
  },
  {
    text: 'すみません',
    reading: 'すみません',
    romaji: 'sumimasen',
    meaning: 'excuse me',
  },
];
