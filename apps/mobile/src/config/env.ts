const apiUrl = process.env.EXPO_PUBLIC_API_URL?.trim();
const clerkPublishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim();
const purchaseUrl = process.env.EXPO_PUBLIC_PURCHASE_URL?.trim();
const webUrl = process.env.EXPO_PUBLIC_WEB_URL?.trim();

const DEFAULT_WEB_URL = 'https://heart.sovereignty.app';
const DEFAULT_PURCHASE_URL = 'https://start.sovereignty.app';

export const env = {
  apiUrl: apiUrl && apiUrl.length > 0 ? apiUrl : '',
  clerkPublishableKey: clerkPublishableKey && clerkPublishableKey.length > 0 ? clerkPublishableKey : '',
  purchaseUrl: purchaseUrl && purchaseUrl.length > 0 ? purchaseUrl : DEFAULT_PURCHASE_URL,
  webUrl: webUrl && webUrl.length > 0 ? webUrl : DEFAULT_WEB_URL,
};

export const webRoutes = {
  signUp: `${env.webUrl.replace(/\/$/, '')}/sign-up`,
  privacy: `${env.webUrl.replace(/\/$/, '')}/privacy`,
  terms: `${env.webUrl.replace(/\/$/, '')}/terms`,
};

export function requireClerkPublishableKey(): string {
  if (!env.clerkPublishableKey) {
    throw new Error('Missing EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY');
  }
  return env.clerkPublishableKey;
}

/**
 * Required public env vars that must be present in a release build. Returned so
 * the app can fail fast (a config error screen) rather than silently bypassing
 * auth/paywall or denying access to every signed-in user.
 */
export function getMissingRequiredEnv(): string[] {
  const missing: string[] = [];
  if (!env.apiUrl) missing.push('EXPO_PUBLIC_API_URL');
  if (!env.clerkPublishableKey) missing.push('EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY');
  return missing;
}
