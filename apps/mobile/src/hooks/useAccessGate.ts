import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Linking } from 'react-native';
import { env } from '../config/env';
import { fetchWithTimeout } from '../lib/http';

type AccessCache = {
  hasAccess: boolean;
  checkedAt: number;
};

const ACCESS_CACHE_TTL_MS = 15 * 60 * 1000;

function buildCacheKey(userId: string) {
  return `sacred-heart:access:${userId}`;
}

/**
 * Definitive entitlement check. Returns a boolean ONLY for an authoritative
 * 200 response. Network failures, timeouts, and 5xx throw so the caller can
 * fall back to the last known grant instead of locking a paying user out.
 */
async function checkAccess(email: string): Promise<boolean> {
  if (!env.apiUrl) {
    throw new Error('Missing API configuration');
  }
  const url = `${env.apiUrl.replace(/\/$/, '')}/api/provision-access/check?email=${encodeURIComponent(email)}`;
  const response = await fetchWithTimeout(url);
  if (!response.ok) {
    throw new Error(`Access check failed (${response.status})`);
  }
  const payload = await response.json();
  return Boolean(payload?.hasAccess);
}

type UseAccessGateParams = {
  userId?: string | null;
  email?: string | null;
  purchaseUrl?: string;
};

export function useAccessGate({ userId, email, purchaseUrl = env.purchaseUrl }: UseAccessGateParams) {
  const [loading, setLoading] = useState(true);
  const [hasAccess, setHasAccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const refresh = useCallback(
    async (force = false) => {
      if (!userId) {
        if (mountedRef.current) {
          setHasAccess(false);
          setError(null);
          setLoading(false);
        }
        return;
      }
      if (!email) {
        // Signed in but no email to verify against — distinct from "not paid".
        if (mountedRef.current) {
          setHasAccess(false);
          setError('Your account has no email address to verify access. Add one on the web app.');
          setLoading(false);
        }
        return;
      }

      if (mountedRef.current) {
        setLoading(true);
        setError(null);
      }
      const cacheKey = buildCacheKey(userId);

      let cached: AccessCache | null = null;
      try {
        const cachedRaw = await AsyncStorage.getItem(cacheKey);
        if (cachedRaw) cached = JSON.parse(cachedRaw);
      } catch {
        cached = null;
      }

      // Use a fresh cache unless the caller explicitly forces a live check
      // (e.g. the user tapped "I upgraded, refresh access").
      if (!force && cached && Date.now() - cached.checkedAt < ACCESS_CACHE_TTL_MS) {
        if (mountedRef.current) {
          setHasAccess(cached.hasAccess);
          setLoading(false);
        }
        return;
      }

      try {
        const liveAccess = await checkAccess(email);
        if (!mountedRef.current) return;
        setHasAccess(liveAccess);
        setError(null);
        setLoading(false);
        try {
          const payload: AccessCache = { hasAccess: liveAccess, checkedAt: Date.now() };
          await AsyncStorage.setItem(cacheKey, JSON.stringify(payload));
        } catch {
          // non-blocking cache write
        }
      } catch {
        if (!mountedRef.current) return;
        // Live check failed (offline / server error). Never lock out a user we
        // previously verified — fall back to the last known grant. Only show an
        // error (and deny) when we have nothing cached to trust.
        if (cached) {
          setHasAccess(cached.hasAccess);
          setError(null);
        } else {
          setHasAccess(false);
          setError("Couldn't verify your access. Check your connection and try again.");
        }
        setLoading(false);
      }
    },
    [email, userId],
  );

  useEffect(() => {
    refresh().catch(() => {
      if (mountedRef.current) {
        setHasAccess(false);
        setLoading(false);
      }
    });
  }, [refresh]);

  const openPurchase = useCallback(async () => {
    try {
      await Linking.openURL(purchaseUrl);
    } catch {
      // ignore — nothing actionable if the OS can't open the URL
    }
  }, [purchaseUrl]);

  return useMemo(
    () => ({
      loading,
      hasAccess,
      error,
      refresh,
      openPurchase,
    }),
    [loading, hasAccess, error, refresh, openPurchase],
  );
}
