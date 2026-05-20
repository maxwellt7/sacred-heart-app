import { useEffect } from 'react';
import { useUser, useAuth } from '@clerk/clerk-react';
import { trackCompleteRegistration, sendServerEvent } from '../utils/pixel';

const STORAGE_KEY = 'ae_signup_tracked';

/**
 * Fires Meta Pixel CompleteRegistration + CAPI event once
 * when a brand-new Clerk user first lands in the authenticated app.
 *
 * Detection: Clerk user.createdAt within last 2 minutes + not already tracked in localStorage.
 * This covers the signup → redirect → dashboard flow reliably.
 */
export default function SignupTracker() {
  const { user, isLoaded } = useUser();
  const { getToken } = useAuth();

  useEffect(() => {
    if (!isLoaded || !user) return;

    // Already tracked this user on this device
    if (localStorage.getItem(STORAGE_KEY) === user.id) return;

    const createdAt = user.createdAt ? new Date(user.createdAt).getTime() : 0;
    const now = Date.now();
    const twoMinutes = 2 * 60 * 1000;

    if (now - createdAt < twoMinutes) {
      // New signup — fire events
      trackCompleteRegistration({
        content_name: 'Clerk Signup',
        status: 'complete',
        value: 0,
        currency: 'USD',
      });

      sendServerEvent('CompleteRegistration', {
        email: user.primaryEmailAddress?.emailAddress,
        sourceUrl: window.location.href,
      });

      // Push signup to GoHighLevel CRM (signed-in users only; backend requires Clerk JWT)
      const BASE = (import.meta.env.VITE_API_URL || '') + '/api';
      (async () => {
        try {
          const token = await getToken();
          await fetch(`${BASE}/ghl/signup`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({
              email: user.primaryEmailAddress?.emailAddress,
              clerkUserId: user.id,
              name: [user.firstName, user.lastName].filter(Boolean).join(' ') || undefined,
            }),
          });
        } catch {
          /* silent — non-blocking */
        }
      })();

      console.log('[Pixel] CompleteRegistration fired for new signup:', user.id);
    }

    // Mark as tracked regardless (so returning users never re-fire)
    localStorage.setItem(STORAGE_KEY, user.id);
  }, [isLoaded, user, getToken]);

  return null;
}
