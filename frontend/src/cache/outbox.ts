import AsyncStorage from '@react-native-async-storage/async-storage';
import { isNetworkError, setOnlineStatus } from './network';

export interface OutboxEntry {
  id: string;
  path: string;
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
  createdAt: number;
  attempts: number;
  lastError?: string;
}

const OUTBOX_STORAGE_KEY = '@tankengo:outbox_queue';
let isDraining = false;

/**
 * Retrieve all currently pending mutations from persistent storage.
 */
export async function getOutbox(): Promise<OutboxEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(OUTBOX_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as OutboxEntry[]) : [];
  } catch {
    return [];
  }
}

/**
 * Save an updated list of outbox entries.
 */
async function saveOutbox(entries: OutboxEntry[]): Promise<void> {
  try {
    await AsyncStorage.setItem(OUTBOX_STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // Non-fatal
  }
}

/**
 * Enqueue a mutation to be sent when connectivity is available.
 */
export async function enqueueMutation(
  mutation: Omit<OutboxEntry, 'id' | 'createdAt' | 'attempts'>,
): Promise<OutboxEntry> {
  const entry: OutboxEntry = {
    ...mutation,
    id: `mut_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    createdAt: Date.now(),
    attempts: 0,
  };

  const current = await getOutbox();
  current.push(entry);
  await saveOutbox(current);
  return entry;
}

/**
 * Remove an entry from the queue once successfully processed.
 */
export async function removeOutboxEntry(id: string): Promise<void> {
  const current = await getOutbox();
  const filtered = current.filter(item => item.id !== id);
  await saveOutbox(filtered);
}

/**
 * Wipes all pending mutations (e.g. on user sign-out).
 */
export async function clearOutbox(): Promise<void> {
  try {
    await AsyncStorage.removeItem(OUTBOX_STORAGE_KEY);
  } catch {
    // Non-fatal
  }
}

export type MutationExecutor = (
  entry: OutboxEntry,
) => Promise<unknown>;

/**
 * Drains all queued mutations in FIFO order using the provided executor.
 * Stops immediately if a network error occurs, preserving remaining items.
 */
export async function drainOutbox(
  executor: MutationExecutor,
): Promise<{ processed: number; remaining: number }> {
  if (isDraining) {
    return { processed: 0, remaining: (await getOutbox()).length };
  }

  isDraining = true;
  let processed = 0;

  try {
    const queue = await getOutbox();
    if (queue.length === 0) {
      return { processed: 0, remaining: 0 };
    }

    const remainingQueue: OutboxEntry[] = [...queue];

    for (let i = 0; i < queue.length; i++) {
      const item = queue[i];
      try {
        await executor(item);
        // Successfully executed: remove from queue
        processed++;
        remainingQueue.shift();
        await saveOutbox(remainingQueue);
        // Successful network activity confirms online status
        setOnlineStatus(true);
      } catch (err: unknown) {
        if (isNetworkError(err)) {
          // Device is offline: stop draining and keep remaining queue for retry
          setOnlineStatus(false);
          break;
        } else {
          // Non-network failure (e.g. 400 Bad Request, 404, or 409 stale conflict)
          // Drop bad entry to prevent queue blockage
          remainingQueue.shift();
          await saveOutbox(remainingQueue);
        }
      }
    }

    return { processed, remaining: remainingQueue.length };
  } finally {
    isDraining = false;
  }
}

