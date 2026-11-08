import { useEffect, useState } from 'react';
import { isLive } from '../config';
import { API_V1, ApiError, request } from './client';

/** A dictionary (JMdict) entry for a word seen in the camera. */
export interface Definition {
  text: string;
  reading: string;
  romaji: string;
  meaning: string;
  partOfSpeech: string;
}

interface DictionaryResponse {
  text: string;
  reading: string;
  romaji: string;
  meaning: string;
  part_of_speech: string;
}

// One lookup per word per app run; null = not a dictionary word.
const cache = new Map<string, Promise<Definition | null>>();

/** Reading and meaning from the backend's dictionary, or null. Never throws. */
export function lookupWord(text: string): Promise<Definition | null> {
  if (!isLive('capture')) {
    return Promise.resolve(null);
  }
  const cached = cache.get(text);
  if (cached) {
    return cached;
  }
  const pending = request<DictionaryResponse>(`${API_V1}/dictionary/lookup`, {
    query: { text },
  })
    .then(r => ({
      text: r.text,
      reading: r.reading,
      romaji: r.romaji,
      meaning: r.meaning,
      partOfSpeech: r.part_of_speech,
    }))
    .catch((err: unknown) => {
      // 404 = not a dictionary word (keep that); other errors may be retried.
      if (!(err instanceof ApiError && err.status === 404)) {
        cache.delete(text);
      }
      return null;
    });
  cache.set(text, pending);
  return pending;
}

/** Definitions for the given words, filled in as lookups finish. */
export function useDefinitions(
  texts: string[],
): Record<string, Definition | null> {
  const [found, setFound] = useState<Record<string, Definition | null>>({});
  const key = [...new Set(texts)].sort().join('\n');
  useEffect(() => {
    let alive = true;
    for (const text of key ? key.split('\n') : []) {
      lookupWord(text).then(def => {
        if (alive) {
          setFound(prev => (text in prev ? prev : { ...prev, [text]: def }));
        }
      });
    }
    return () => {
      alive = false;
    };
  }, [key]);
  return found;
}
