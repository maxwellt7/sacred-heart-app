import { useEffect, useState } from 'react';
import NetInfo from '@react-native-community/netinfo';

type NetworkState = {
  isConnected: boolean;
  isInternetReachable: boolean | null;
};

/**
 * Tracks connectivity. `isOffline` is only true when we are confident there is
 * no connection, so we never block the UI on an indeterminate reachability probe.
 */
export function useNetwork() {
  const [state, setState] = useState<NetworkState>({
    isConnected: true,
    isInternetReachable: null,
  });

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((next) => {
      setState({
        isConnected: next.isConnected ?? false,
        isInternetReachable: next.isInternetReachable,
      });
    });

    NetInfo.fetch()
      .then((next) => {
        setState({
          isConnected: next.isConnected ?? false,
          isInternetReachable: next.isInternetReachable,
        });
      })
      .catch(() => undefined);

    return unsubscribe;
  }, []);

  const isOffline = !state.isConnected || state.isInternetReachable === false;

  return { ...state, isOffline };
}
