import { useEffect, useState } from 'react';
import { isOnline, subscribeNetwork } from '../cache/network';

/** Whether the app can reach the server right now, as last seen by a request. */
export function useOnline(): boolean {
  const [online, setOnline] = useState(isOnline());
  useEffect(() => {
    // In case it changed between the first render and subscribing.
    setOnline(isOnline());
    return subscribeNetwork(setOnline);
  }, []);
  return online;
}
