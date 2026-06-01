import { useCallback, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Linking } from 'react-native';
import { env } from '../config/env';

type AccessCache = {
  hasAccess: boolean;
  checkedAt: number;
};

const ACCESS_CACHE_TTL_MS = 15 * 60 * 1000;

function buildCacheKey(userId: string) {
  return `sacred-heart:access:${userId}`;
}

async function checkAccess(email: string): Promise<boolean> {
  if (!env.apiUrl) {
    return false;
  }
  const url = `${env.apiUrl.replace(/\/$/, '')}/api/provision-access/check?email=${encodeURIComponent(email)}`;
  const response = await fetch(url);
  if (!response.ok) {
    return false;
  }
  const payload = await response.json();
  return Boolean(payload?.hasAccess);
}

type UseAccessGateParams = {
  userId?: string | null;
  email?: string | null;
  purchaseUrl?: string;
};

export function useAccessGate({ userId, email, purchaseUrl = 'https://start.sovereignty.app' }: UseAccessGateParams) {
  const [loading, setLoading] = useState(true);
  const [hasAccess, setHasAccess] = useState(false);

  const refresh = useCallback(async () => {
    if (!userId || !email) {
      setHasAccess(false);
      setLoading(false);
      return;
    }

    setLoading(true);
    const cacheKey = buildCacheKey(userId);
    try {
      const cachedRaw = await AsyncStorage.getItem(cacheKey);
      if (cachedRaw) {
        const cached: AccessCache = JSON.parse(cachedRaw);
        if (Date.now() - cached.checkedAt < ACCESS_CACHE_TTL_MS) {
          setHasAccess(cached.hasAccess);
          setLoading(false);
          return;
        }
      }
    } catch {
      // Ignore cache failures and continue with live request.
    }

    const liveAccess = await checkAccess(email);
    setHasAccess(liveAccess);
    setLoading(false);

    try {
      const cachePayload: AccessCache = { hasAccess: liveAccess, checkedAt: Date.now() };
      await AsyncStorage.setItem(cacheKey, JSON.stringify(cachePayload));
    } catch {
      // Non-blocking cache write.
    }
  }, [email, userId]);

  useEffect(() => {
    refresh().catch(() => {
      setHasAccess(false);
      setLoading(false);
    });
  }, [refresh]);

  const openPurchase = useCallback(async () => {
    await Linking.openURL(purchaseUrl);
  }, [purchaseUrl]);

  return useMemo(
    () => ({
      loading,
      hasAccess,
      refresh,
      openPurchase,
    }),
    [loading, hasAccess, refresh, openPurchase],
  );
}
