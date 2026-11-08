import { useState } from 'react';
import { catchTango } from '../../api/capture';
import { getStaffAudio } from '../../api/rehearse';
import { listTango } from '../../api/tango';
import { playUrl } from '../../audio/audio';

export type SaveState = 'idle' | 'saving' | 'saved' | 'owned' | 'failed';

/** Icon next to each label. */
export const SAVE_ICON: Record<
  SaveState,
  'add' | 'done' | 'retry' | undefined
> = {
  idle: 'add',
  saving: undefined,
  saved: 'done',
  owned: 'done',
  failed: 'retry',
};

export const SAVE_LABEL: Record<SaveState, string> = {
  idle: 'Save as Tango',
  saving: 'Saving…',
  saved: 'Saved to your Tango',
  owned: 'Already in your Tango',
  failed: 'Could not save. Try again',
};

/** Says a word aloud (cached Japanese voice). Silent if audio is unavailable. */
export async function playWord(text: string): Promise<void> {
  const url = await getStaffAudio(text, 'natural').catch(() => null);
  if (url) {
    await playUrl(url).catch(() => {});
  }
}

/**
 * Saving a word seen in the app (not the camera) as a Tango. Words already
 * saved are left alone instead of getting an extra sighting.
 */
export function useSaveWord(word: {
  text: string;
  reading?: string;
  meaning?: string;
}): { state: SaveState; save: () => Promise<void>; busy: boolean } {
  const [state, setState] = useState<SaveState>('idle');
  const save = async () => {
    setState('saving');
    try {
      const existing = await listTango(word.text);
      if (existing.some(t => t.text === word.text)) {
        setState('owned');
        return;
      }
      await catchTango({
        detection: {
          item_id: `app:${word.text}`,
          item_type: 'text',
          source_label: word.text,
          japanese_text: word.text,
          reading: word.reading ?? null,
          english_gloss: word.meaning ?? null,
          confidence: null,
          bounding_box: [],
          known: false,
        },
      });
      setState('saved');
    } catch {
      setState('failed');
    }
  };
  return { state, save, busy: state !== 'idle' && state !== 'failed' };
}
