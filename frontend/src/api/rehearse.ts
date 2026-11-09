import { resultFor, scriptFor } from '../mocks/rehearse';
import type {
  JpText,
  RehearsalResult,
  RehearsalScript,
  RehearsalTurn,
  ReplyChoice,
  Suggestion,
  TurnAnswer,
} from '../types';
import { API_V1, mockDelay, pick, request } from './client';
import { type PlaceResponse, toPlace } from './places';
import { copy } from '../copy';

// ---- Backend shapes (backend/app/schemas/rehearsal.py) ----

interface JpNameResponse {
  text: string;
  reading: string | null;
  romaji: string | null;
  meaning: string | null;
}

interface SuggestionResponse {
  jp: JpNameResponse;
  why: string;
}

interface TurnResponse {
  id: string;
  speaker: 'staff' | 'user';
  jp: JpNameResponse;
  en: string;
  hint: string | null;
  choices: {
    jp: JpNameResponse;
    en: string;
    ok: boolean;
    label: string;
    note: string;
    suggestion: SuggestionResponse | null;
  }[];
}

interface StartResponse {
  rehearsal_id: string;
  place: PlaceResponse;
  staff_voice: string;
  turns: TurnResponse[];
}

interface TurnResultResponse {
  turn_id: string;
  staff: JpNameResponse;
  said: JpNameResponse;
  spoken: boolean;
  ok: boolean;
  label: string;
  note: string;
  suggestion: SuggestionResponse | null;
}

interface ResultResponse {
  place: PlaceResponse;
  lines: TurnResultResponse[];
}

// ---- Adapters ----

function toJp(n: JpNameResponse): JpText {
  return {
    text: n.text,
    reading: n.reading ?? undefined,
    romaji: n.romaji ?? undefined,
    meaning: n.meaning ?? undefined,
  };
}

function toSuggestion(s: SuggestionResponse | null): Suggestion | undefined {
  return s ? { jp: toJp(s.jp), why: s.why } : undefined;
}

function toTurn(t: TurnResponse): RehearsalTurn {
  return {
    id: t.id,
    speaker: t.speaker,
    jp: toJp(t.jp),
    en: t.en,
    hint:
      t.speaker === 'user'
        ? {
            explanation: t.hint ?? 'Try answering like this:',
            model: toJp(t.jp),
            modelEn: t.en,
          }
        : undefined,
    choices: t.choices.map(c => ({
      jp: toJp(c.jp),
      en: c.en,
      ok: c.ok,
      label: c.label,
      note: c.note,
      suggestion: toSuggestion(c.suggestion),
    })),
  };
}

function toAnswer(r: TurnResultResponse): TurnAnswer {
  return {
    said: toJp(r.said),
    spoken: r.spoken,
    ok: r.ok,
    label: r.label,
    note: r.note,
    suggestion: toSuggestion(r.suggestion),
  };
}

// ---- Mock helpers ----

/** Mock user turns get three replies: the model one, a stiff one, a wrong one. */
function mockChoices(turn: RehearsalTurn): ReplyChoice[] {
  if (turn.speaker !== 'user') {
    return [];
  }
  const suggestion = { jp: turn.jp, why: 'This is what staff usually hear.' };
  return [
    {
      jp: turn.jp,
      en: turn.en,
      ok: true,
      label: 'Natural and polite',
      note: 'Exactly right.',
    },
    {
      jp: {
        text: 'はい。',
        reading: 'はい。',
        romaji: 'hai.',
        meaning: 'Yes.',
      },
      en: 'Yes.',
      ok: false,
      label: 'Understood, but short',
      note: 'Works, but sounds abrupt here.',
      suggestion,
    },
    {
      jp: {
        text: 'わかりません。',
        reading: 'わかりません。',
        romaji: 'wakarimasen.',
        meaning: "I don't understand.",
      },
      en: "I don't understand.",
      ok: false,
      label: 'Off topic',
      note: "That doesn't answer the question.",
      suggestion,
    },
  ];
}

// ---- API ----

/** Starts a role-play. The script is written once per place on the backend and reused. */
export const startRehearsal = pick(
  'rehearse',
  (placeId: string, _language: string = 'English') => {
    const script = scriptFor(placeId);
    return mockDelay<RehearsalScript>({
      ...script,
      rehearsalId: null,
      turns: script.turns.map(t => ({ ...t, choices: mockChoices(t) })),
    });
  },
  async (
    placeId: string,
    language: string = 'English',
  ): Promise<RehearsalScript> => {
    const r = await request<StartResponse>(`${API_V1}/rehearsals`, {
      method: 'POST',
      body: { place_id: placeId, language },
    });
    return {
      rehearsalId: r.rehearsal_id,
      place: toPlace(r.place),
      staffVoice: r.staff_voice,
      turns: r.turns.map(toTurn),
    };
  },
);

export type ReplyInput =
  | { choiceIndex: number }
  | { audioBase64: string; mimeType: string };

/** Rates one reply: a recording (Gemini on the backend) or one of the offered choices (free). */
export const answerTurn = pick(
  'rehearse',
  (_rehearsalId: string | null, turn: RehearsalTurn, reply: ReplyInput) => {
    const choice =
      'choiceIndex' in reply
        ? turn.choices?.[reply.choiceIndex]
        : turn.choices?.[0];
    return mockDelay<TurnAnswer>({
      said: choice?.jp ?? turn.jp,
      spoken: !('choiceIndex' in reply),
      ok: choice?.ok ?? true,
      label: choice?.label ?? 'Natural',
      note: choice?.note ?? '',
      suggestion: choice?.suggestion,
    });
  },
  async (
    rehearsalId: string | null,
    turn: RehearsalTurn,
    reply: ReplyInput,
  ) => {
    if (!rehearsalId) {
      throw new Error(copy.errors.noRehearsalSession);
    }
    const body =
      'choiceIndex' in reply
        ? { choice_index: reply.choiceIndex }
        : { audio_base64: reply.audioBase64, mime_type: reply.mimeType };
    return toAnswer(
      await request<TurnResultResponse>(
        `${API_V1}/rehearsals/${encodeURIComponent(
          rehearsalId,
        )}/turns/${encodeURIComponent(turn.id)}`,
        { method: 'POST', body },
      ),
    );
  },
);

export const getRehearsalResult = pick(
  'rehearse',
  (_rehearsalId: string | null, placeId: string) =>
    mockDelay<RehearsalResult>(resultFor(placeId), 600),
  async (
    rehearsalId: string | null,
    placeId: string,
  ): Promise<RehearsalResult> => {
    if (!rehearsalId) {
      return resultFor(placeId);
    }
    const r = await request<ResultResponse>(
      `${API_V1}/rehearsals/${encodeURIComponent(rehearsalId)}/results`,
    );
    return {
      place: toPlace(r.place),
      lines: r.lines.map(l => ({
        staff: toJp(l.staff),
        said: toJp(l.said),
        ok: l.ok,
        note: l.note || l.label,
        suggestion: l.suggestion
          ? { jp: toJp(l.suggestion.jp), why: l.suggestion.why }
          : undefined,
      })),
    };
  },
);

/** Spoken staff line. Null when audio isn't available (mock mode, TTS off or failing). */
export const getStaffAudio = pick(
  'rehearse',
  (_text: string, _speed: 'slower' | 'natural') =>
    mockDelay<string | null>(null, 50),
  async (text: string, speed: 'slower' | 'natural') => {
    try {
      const r = await request<{ audio_url: string }>(`${API_V1}/speech/tts`, {
        method: 'POST',
        body: { text, speed },
      });
      return r.audio_url;
    } catch {
      return null;
    }
  },
);
