import { useCallback, useEffect, useRef, useState } from 'react';

export interface AsyncState<T> {
  data: T | undefined;
  error: Error | undefined;
  loading: boolean;
  reload: () => void | Promise<void>;
}

/**
 * Runs `load` on mount and whenever `key` changes.
 * `key` stands in for the dependency list (e.g. a placeId or search query).
 */
export function useAsync<T>(load: () => Promise<T>, key: string = ''): AsyncState<T> {
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<Error | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);

  // Keep the latest loader without re-running the effect on every render.
  // This effect is declared first, so it runs before the loading effect below.
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  });

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(undefined);
    loadRef
      .current()
      .then(result => {
        if (alive) {
          setData(result);
        }
      })
      .catch((err: unknown) => {
        if (alive) {
          setError(err instanceof Error ? err : new Error(String(err)));
        }
      })
      .finally(() => {
        if (alive) {
          setLoading(false);
        }
      });
    return () => {
      alive = false;
    };
  }, [key, nonce]);

  const reload = useCallback(() => setNonce(n => n + 1), []);

  return { data, error, loading, reload };
}
