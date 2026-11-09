import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { useDebouncedValue } from '../src/hooks/useDebouncedValue';

describe('useDebouncedValue', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test('only publishes the latest value after the delay', async () => {
    let result = '';
    function Probe({ value }: { value: string }): null {
      result = useDebouncedValue(value, 300);
      return null;
    }

    let tree!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      tree = ReactTestRenderer.create(<Probe value="" />);
    });
    await ReactTestRenderer.act(async () => {
      tree.update(<Probe value="c" />);
    });
    await ReactTestRenderer.act(async () => {
      jest.advanceTimersByTime(150);
    });
    await ReactTestRenderer.act(async () => {
      tree.update(<Probe value="ca" />);
    });
    await ReactTestRenderer.act(async () => {
      jest.advanceTimersByTime(299);
    });
    expect(result).toBe('');

    await ReactTestRenderer.act(async () => {
      jest.advanceTimersByTime(1);
    });
    expect(result).toBe('ca');

    await ReactTestRenderer.act(async () => tree.unmount());
  });
});
