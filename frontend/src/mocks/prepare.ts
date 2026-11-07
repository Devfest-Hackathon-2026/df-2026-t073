import type { PrepareBriefing } from '../types';
import { PLACES } from './places';
import { TANGO } from './tango';

const GENERIC_STEPS = [
  'Say hello when you walk in. Staff will usually greet you first.',
  'Have a short version of what you need ready before you reach the counter.',
  'If you miss something, ask them to repeat it slowly.',
];

export const BRIEFINGS: Record<string, PrepareBriefing> = {
  'menya-taiki': {
    place: PLACES['menya-taiki'],
    source: 'Prepared by Gemini · grounded in Google Maps (mock)',
    steps: [
      'People mention a ticket machine by the door. You buy a ticket first, then sit.',
      "Reviews say it's cash only. Bring coins or ¥1000 notes.",
      'Staff may ask how firm you want your noodles when you hand over the ticket.',
    ],
    tango: [TANGO.shokken, TANGO.shoyu, TANGO.oomori, TANGO.katame],
    tips: [
      {
        id: 'tip-1',
        quote: 'When I handed over my ticket, staff asked how firm I wanted my noodles.',
        learners: 3,
        when: 'last month',
        inRehearsal: true,
      },
      {
        id: 'tip-2',
        quote: "Counter seats only. If it's full, you wait outside in a line.",
        learners: 2,
        when: 'this week',
        inRehearsal: false,
      },
    ],
  },
};

export function briefingFor(placeId: string): PrepareBriefing {
  const known = BRIEFINGS[placeId];
  if (known) {
    return known;
  }
  const place = PLACES[placeId] ?? PLACES['menya-taiki'];
  return {
    place,
    source: 'Prepared by Gemini · grounded in Google Maps (mock)',
    steps: GENERIC_STEPS,
    tango: [TANGO['tachiiri-kinshi'], TANGO.igai],
    tips: [],
  };
}
