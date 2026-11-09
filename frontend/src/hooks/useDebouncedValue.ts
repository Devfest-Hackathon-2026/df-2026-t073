import { useEffect, useState } from 'react';

const DEFAULT_DEBOUNCE_MS = 300;

export function useDebouncedValue<T>(
  value: T,
  delayMs: number = DEFAULT_DEBOUNCE_MS,
): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timeout = setTimeout(() => setDebouncedValue(value), delayMs);
    return () => clearTimeout(timeout);
  }, [value, delayMs]);

  return debouncedValue;
}
