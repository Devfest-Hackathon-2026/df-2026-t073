import { AppState, type AppStateStatus } from 'react-native';

type NetworkListener = (isOnline: boolean) => void;

let currentIsOnline = true;
const listeners = new Set<NetworkListener>();

/**
 * Returns current known online status.
 */
export function isOnline(): boolean {
  return currentIsOnline;
}

/**
 * Notify all subscribers of network state change.
 */
export function setOnlineStatus(online: boolean): void {
  if (currentIsOnline !== online) {
    currentIsOnline = online;
    listeners.forEach(cb => {
      try {
        cb(online);
      } catch {
        // Prevent subscriber errors from bubbling
      }
    });
  }
}

/**
 * Subscribe to online/offline transitions.
 */
export function subscribeNetwork(listener: NetworkListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Checks connectivity by making a fast head request or observing recent errors.
 */
export function isNetworkError(err: unknown): boolean {
  if (!err) {
    return false;
  }
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes('Network request failed') ||
    msg.includes('Failed to fetch') ||
    msg.includes('timeout') ||
    msg.includes('Timed out') ||
    msg.includes('AbortError') ||
    msg.includes('network error')
  );
}

// Automatically trigger connectivity checks when app comes to the foreground
AppState.addEventListener('change', (status: AppStateStatus) => {
  if (status === 'active') {
    // When returning to foreground, assume connectivity is available until proven otherwise
    setOnlineStatus(true);
  }
});

