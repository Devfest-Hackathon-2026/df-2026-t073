import { useIsFocused } from '@react-navigation/native';
import { useEffect, useRef } from 'react';

/**
 * Re-runs loaders when the screen comes back into view. Tab screens stay
 * mounted, so without this they keep showing what they loaded at startup
 * (e.g. a Tango caught on the camera wouldn't appear in Review).
 */
export function useReloadOnFocus(...reloads: (() => void)[]): void {
  const focused = useIsFocused();
  const wasFocused = useRef(focused);
  const latest = useRef(reloads);
  useEffect(() => {
    latest.current = reloads;
  });
  useEffect(() => {
    if (focused && !wasFocused.current) {
      latest.current.forEach(reload => reload());
    }
    wasFocused.current = focused;
  }, [focused]);
}
