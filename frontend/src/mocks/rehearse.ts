import type { RehearsalResult, RehearsalScript } from '../types';
import { PLACES } from './places';

export function scriptFor(placeId: string): RehearsalScript {
  const place = PLACES[placeId] ?? PLACES['menya-taiki'];
  return {
    place,
    staffVoice: 'Staff voice 3 of 8',
    turns: [
      {
        id: 't1',
        speaker: 'staff',
        jp: {
          text: 'いらっしゃいませ。食券をお願いします。',
          reading: 'いらっしゃいませ。しょっけんをおねがいします。',
          romaji: 'irasshaimase. shokken o onegai shimasu.',
        },
        en: 'Welcome. Your meal ticket, please.',
      },
      {
        id: 'u1',
        speaker: 'user',
        jp: {
          text: 'はい、お願いします。',
          reading: 'はい、おねがいします。',
          romaji: 'hai, onegai shimasu.',
        },
        en: 'Yes, here you go.',
        naturalness: { ok: true, label: 'Natural and polite' },
        hint: {
          explanation: 'They want your meal ticket. Hand it over and say:',
          model: {
            text: 'はい、お願いします。',
            reading: 'はい、おねがいします。',
            romaji: 'hai, onegai shimasu.',
          },
          modelEn: 'Yes, here you go.',
        },
      },
      {
        id: 't2',
        speaker: 'staff',
        jp: {
          text: '麺の硬さはどうしますか？',
          reading: 'めんのかたさはどうしますか？',
          romaji: 'men no katasa wa dō shimasu ka?',
        },
        en: 'How firm would you like your noodles?',
      },
      {
        id: 'u2',
        speaker: 'user',
        jp: {
          text: 'かたい、お願いします。',
          reading: 'かたい、おねがいします。',
          romaji: 'katai, onegai shimasu.',
        },
        en: 'Hard, please.',
        naturalness: { ok: false, label: 'Understood, but shops say かため' },
        hint: {
          explanation: "They're asking how firm you want the noodles. Try:",
          model: {
            text: 'かためでお願いします。',
            reading: 'かためでおねがいします。',
            romaji: 'katame de onegai shimasu.',
          },
          modelEn: 'Firm, please. Say it your own way if you like.',
        },
      },
      {
        id: 't3',
        speaker: 'staff',
        jp: {
          text: 'お待たせしました。',
          reading: 'おまたせしました。',
          romaji: 'omatase shimashita.',
        },
        en: 'Sorry to keep you waiting.',
      },
      {
        id: 'u3',
        speaker: 'user',
        jp: {
          text: 'ありがとうございます。',
          reading: 'ありがとうございます。',
          romaji: 'arigatō gozaimasu.',
        },
        en: 'Thank you.',
        naturalness: { ok: true, label: 'Natural and polite' },
        hint: {
          explanation: 'Your ramen is here. Thank them:',
          model: {
            text: 'ありがとうございます。',
            reading: 'ありがとうございます。',
            romaji: 'arigatō gozaimasu.',
          },
          modelEn: 'Thank you.',
        },
      },
    ],
  };
}

export function resultFor(placeId: string): RehearsalResult {
  const script = scriptFor(placeId);
  const [t1, u1, t2, u2, t3, u3] = script.turns;
  return {
    place: script.place,
    lines: [
      { staff: t1.jp, said: u1.jp, ok: true, note: 'Natural and polite. Nothing to change.' },
      {
        staff: t2.jp,
        said: u2.jp,
        ok: false,
        note: 'Understood, but not what shops say.',
        suggestion: {
          jp: {
            text: 'かためでお願いします。',
            reading: 'かためでおねがいします。',
            romaji: 'katame de onegai shimasu.',
          },
          why: 'Shops use かため for noodle firmness.',
        },
      },
      { staff: t3.jp, said: u3.jp, ok: true, note: 'Natural and polite.' },
    ],
  };
}
