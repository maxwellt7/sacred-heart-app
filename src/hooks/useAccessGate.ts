/**
 * useAccessGate — checks if the current user has paid access
 * 
 * Admin users always get access (checked client-side AND server-side).
 * Calls GET /api/provision-access/check?email=... with the Clerk user's email.
 * Also links the Clerk user ID to the paid record on first check.
 */

import { useState, useEffect } from 'react';
import { useUser, useAuth } from '@clerk/clerk-react';

const API_BASE = import.meta.env.VITE_API_URL || 'https://nlp-training-backend-production.up.railway.app';

// Admin emails that always have full access
const ADMIN_EMAILS = [
  'maxwellmayes@gmail.com',
  'maxwell@sovereignty.app',
  'max@maxwellmayes.com',
];

// Admin email domains — any email on these domains gets admin access
const ADMIN_DOMAINS = [
  'sovereignty.app',
  'maxwellmayes.com',
];

function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const lower = email.toLowerCase().trim();
  if (ADMIN_EMAILS.some(e => e.toLowerCase() === lower)) return true;
  const domain = lower.split('@')[1];
  if (domain && ADMIN_DOMAINS.some(d => d === domain)) return true;
  return false;
}

/** Extract the best email from the Clerk user object */
function getUserEmail(user: any): string | null {
  // Try primaryEmailAddress first
  if (user?.primaryEmailAddress?.emailAddress) {
    return user.primaryEmailAddress.emailAddress;
  }
  // Fallback: check emailAddresses array
  if (user?.emailAddresses && user.emailAddresses.length > 0) {
    return user.emailAddresses[0].emailAddress;
  }
  return null;
}

interface AccessState {
  hasAccess: boolean;
  loading: boolean;
  status: string;
  plan: string | null;
  purchaseUrl: string;
}

export function useAccessGate(): AccessState {
  const { user, isLoaded: userLoaded } = useUser();
  const { getToken } = useAuth();
  const [state, setState] = useState<AccessState>({
    hasAccess: false,
    loading: true,
    status: 'checking',
    plan: null,
    purchaseUrl: 'https://start.sovereignty.app',
  });

  useEffect(() => {
    console.log('[AccessGate] Effect running. userLoaded:', userLoaded, 'user:', !!user);

    if (!userLoaded) {
      console.log('[AccessGate] Clerk not loaded yet, waiting...');
      return;
    }

    if (!user) {
      console.log('[AccessGate] No user found after Clerk loaded');
      setState({
        hasAccess: false,
        loading: false,
        status: 'no-user',
        plan: null,
        purchaseUrl: 'https://start.sovereignty.app',
      });
      return;
    }

    const email = getUserEmail(user);
    console.log('[AccessGate] User email:', email);
    console.log('[AccessGate] primaryEmailAddress:', user.primaryEmailAddress?.emailAddress);
    console.log('[AccessGate] emailAddresses:', user.emailAddresses?.map((e: any) => e.emailAddress));

    if (!email) {
      console.log('[AccessGate] No email found on user object');
      setState({
        hasAccess: false,
        loading: false,
        status: 'no-email',
        plan: null,
        purchaseUrl: 'https://start.sovereignty.app',
      });
      return;
    }

    // Admin bypass — always grant access immediately
    const adminCheck = isAdminEmail(email);
    console.log('[AccessGate] isAdminEmail check:', adminCheck, 'for email:', email);
    
    if (adminCheck) {
      console.log('[AccessGate] ADMIN ACCESS GRANTED for:', email);
      setState({
        hasAccess: true,
        loading: false,
        status: 'admin',
        plan: 'admin',
        purchaseUrl: 'https://start.sovereignty.app',
      });
      return;
    }

    // Check local cache first (valid for 5 minutes)
    const cacheKey = `access-gate-${user.id}`;
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      try {
        const { data, timestamp } = JSON.parse(cached);
        if (Date.now() - timestamp < 5 * 60 * 1000) {
          console.log('[AccessGate] Using cached result:', data.status);
          setState({ ...data, loading: false });
          return;
        }
      } catch {
        // Invalid cache, continue to API check
      }
    }

    const checkAccess = async () => {
      try {
        console.log('[AccessGate] Calling API for:', email);
        const response = await fetch(
          `${API_BASE}/api/provision-access/check?email=${encodeURIComponent(email)}`
        );
        const data = await response.json();
        console.log('[AccessGate] API response:', data);

        const accessState: AccessState = {
          hasAccess: data.hasAccess === true,
          loading: false,
          status: data.status || 'unknown',
          plan: data.plan || null,
          purchaseUrl: data.purchaseUrl || 'https://start.sovereignty.app',
        };

        setState(accessState);

        // Cache the result
        localStorage.setItem(cacheKey, JSON.stringify({
          data: accessState,
          timestamp: Date.now(),
        }));

        // If they have access, link their Clerk ID to the paid record
        if (data.hasAccess) {
          try {
            const token = await getToken();
            await fetch(`${API_BASE}/api/provision-access/link-clerk`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
              },
              body: JSON.stringify({ email }),
            });
          } catch {
            // Non-critical — linking can happen later
          }
        }
      } catch (err) {
        console.error('[AccessGate] Check failed:', err);

        // On error, prefer last-known cached state (even if stale) so that
        // paid users aren't locked out by a transient backend hiccup. If we
        // have no prior knowledge of this user's access, fail CLOSED so
        // non-paying users can't bypass the gate by knocking out the API.
        if (cached) {
          try {
            const { data } = JSON.parse(cached);
            setState({ ...data, loading: false, status: 'error-stale-cache' });
            return;
          } catch {
            // fall through to fail-closed
          }
        }
        setState({
          hasAccess: false,
          loading: false,
          status: 'error',
          plan: null,
          purchaseUrl: 'https://start.sovereignty.app',
        });
      }
    };

    checkAccess();
  }, [userLoaded, user, getToken]);

  return state;
}
