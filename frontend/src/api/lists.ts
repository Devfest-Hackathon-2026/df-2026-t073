import type { TangoList } from '../types';
import { API_V1, mockDelay, pick, request } from './client';

/** Backend shape (backend/app/schemas/lists.py). */
interface TangoListResponse {
  list_id: string;
  name: string;
  tango_ids: string[];
  created_at: string;
}

const toList = (r: TangoListResponse): TangoList => ({
  id: r.list_id,
  name: r.name,
  tangoIds: r.tango_ids,
});

// Mock lists live in memory for the session.
const mockLists: TangoList[] = [];

/** The user's review lists, oldest first. */
export const listLists = pick(
  'review',
  () => mockDelay<TangoList[]>([...mockLists], 150),
  async () =>
    (await request<TangoListResponse[]>(`${API_V1}/lists`)).map(toList),
);

export const createList = pick(
  'review',
  (name: string, tangoIds: string[] = []) => {
    const created = { id: `ls_${Date.now()}`, name, tangoIds: [...tangoIds] };
    mockLists.push(created);
    return mockDelay<TangoList>(created, 150);
  },
  async (name: string, tangoIds: string[] = []) =>
    toList(
      await request<TangoListResponse>(`${API_V1}/lists`, {
        method: 'POST',
        body: { name, tango_ids: tangoIds },
      }),
    ),
);

export interface ListChange {
  name?: string;
  add?: string[];
  remove?: string[];
}

/** Rename, and/or add and remove Tango (by id). */
export const updateList = pick(
  'review',
  (id: string, change: ListChange) => {
    const found = mockLists.find(l => l.id === id);
    if (!found) {
      throw new Error('List not found');
    }
    if (change.name) {
      found.name = change.name;
    }
    const gone = new Set(change.remove ?? []);
    found.tangoIds = found.tangoIds.filter(t => !gone.has(t));
    for (const t of change.add ?? []) {
      if (!gone.has(t) && !found.tangoIds.includes(t)) {
        found.tangoIds.push(t);
      }
    }
    return mockDelay<TangoList>({ ...found }, 150);
  },
  async (id: string, change: ListChange) =>
    toList(
      await request<TangoListResponse>(
        `${API_V1}/lists/${encodeURIComponent(id)}`,
        {
          method: 'PATCH',
          body: {
            name: change.name,
            add: change.add ?? [],
            remove: change.remove ?? [],
          },
        },
      ),
    ),
);

export const deleteList = pick(
  'review',
  (id: string) => {
    const index = mockLists.findIndex(l => l.id === id);
    if (index >= 0) {
      mockLists.splice(index, 1);
    }
    return mockDelay<void>(undefined, 150);
  },
  async (id: string) => {
    await request<void>(`${API_V1}/lists/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  },
);

/** Review collection id for a list. */
export const listCollectionId = (id: string) => `list:${id}`;
