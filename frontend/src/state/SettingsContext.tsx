import AsyncStorage from '@react-native-async-storage/async-storage';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import type { ReadingLevel, Settings } from '../types';
import { setLocationEnabled } from '../location/location';

const STORAGE_KEY = 'tankengo.settings.v1';

export const DEFAULT_SETTINGS: Settings = {
  showJapaneseAs: 'kanji',
  furigana: true,
  appJapanese: 'some',
  englishAfterRoleplayLine: true,
  staffSpeed: 'slower',
  phrasesFirst: 'easy',
  explanationsLanguage: 'English',
  readingLevel: 'kana',
  locationAllowed: false,
  onboarded: false,
  dayOne: false,
  rehearsedOnce: false,
  mapFeatures: true,
};

/** Display defaults that follow from the reading level picked on first run. */
export function settingsForReadingLevel(
  level: ReadingLevel,
): Partial<Settings> {
  switch (level) {
    case 'none':
      return {
        readingLevel: level,
        showJapaneseAs: 'romaji',
        furigana: true,
        appJapanese: 'little',
      };
    case 'kana':
      return {
        readingLevel: level,
        showJapaneseAs: 'kanji',
        furigana: true,
        appJapanese: 'some',
      };
    case 'some_kanji':
      return {
        readingLevel: level,
        showJapaneseAs: 'kanji',
        furigana: true,
        appJapanese: 'some',
      };
    case 'most':
      return {
        readingLevel: level,
        showJapaneseAs: 'kanji',
        furigana: false,
        appJapanese: 'lot',
      };
  }
}

interface SettingsContextValue {
  settings: Settings;
  /** False until saved settings have been read from storage. */
  ready: boolean;
  update: (patch: Partial<Settings>) => void;
  /** Back to first-run defaults (shows the welcome screen again). */
  reset: () => void;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({
  children,
}: {
  children: React.ReactNode;
}): React.JSX.Element {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [ready, setReady] = useState(false);

  // One switch for every use of location (see Me › Map and location settings).
  useEffect(() => {
    setLocationEnabled(settings.mapFeatures);
  }, [settings.mapFeatures]);

  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(STORAGE_KEY)
      .then(raw => {
        if (alive && raw) {
          setSettings({
            ...DEFAULT_SETTINGS,
            ...(JSON.parse(raw) as Partial<Settings>),
          });
        }
      })
      .catch(() => {
        // Unreadable storage: fall back to defaults.
      })
      .finally(() => {
        if (alive) {
          setReady(true);
        }
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (ready) {
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(settings)).catch(() => {
        // Not critical: settings just won't survive a restart.
      });
    }
  }, [ready, settings]);

  const update = useCallback((patch: Partial<Settings>) => {
    setSettings(prev => ({ ...prev, ...patch }));
  }, []);

  const reset = useCallback(() => {
    setSettings(DEFAULT_SETTINGS);
  }, []);

  const value = useMemo(
    () => ({ settings, ready, update, reset }),
    [settings, ready, update, reset],
  );

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings(): SettingsContextValue {
  const value = useContext(SettingsContext);
  if (!value) {
    throw new Error('useSettings must be used inside <SettingsProvider>');
  }
  return value;
}
