import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { useSaveWord } from '../src/features/tango/saveWord';
import { SettingsProvider } from '../src/state/SettingsContext';

const mockCatch = jest.fn();
const mockDelete = jest.fn();
jest.mock('../src/api/capture', () => ({
  catchTango: (...args: unknown[]) => mockCatch(...args),
}));
jest.mock('../src/api/tango', () => ({
  deleteTango: (...args: unknown[]) => mockDelete(...args),
}));

type Saver = ReturnType<typeof useSaveWord>;

async function renderSaver() {
  const ref: { current: Saver | null } = { current: null };
  function Probe() {
    ref.current = useSaveWord({ text: '西口', reading: 'にしぐち' });
    return null;
  }
  await ReactTestRenderer.act(async () => {
    ReactTestRenderer.create(
      <SettingsProvider>
        <Probe />
      </SettingsProvider>,
    );
  });
  return ref;
}

beforeEach(() => {
  mockCatch.mockReset();
  mockDelete.mockReset().mockResolvedValue(undefined);
});

test('undo removes a Tango this save created', async () => {
  mockCatch.mockResolvedValue({ tango: { id: 't1' }, created: true });
  const saver = await renderSaver();
  await ReactTestRenderer.act(() => saver.current!.save());
  expect(saver.current!.canUndo).toBe(true);
  await ReactTestRenderer.act(() => saver.current!.undo());
  expect(mockDelete).toHaveBeenCalledWith('t1');
  expect(saver.current!.state).toBe('idle');
});

test('a word that was already saved cannot be undone', async () => {
  mockCatch.mockResolvedValue({ tango: { id: 'old' }, created: false });
  const saver = await renderSaver();
  await ReactTestRenderer.act(() => saver.current!.save());
  expect(saver.current!.state).toBe('owned');
  expect(saver.current!.canUndo).toBe(false);
  await ReactTestRenderer.act(() => saver.current!.undo());
  expect(mockDelete).not.toHaveBeenCalled();
});
