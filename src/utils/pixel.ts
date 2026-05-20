// Meta Pixel + Conversions API event tracking
// Pixel ID: 2035820893688270

declare global {
  interface Window {
    fbq: (...args: any[]) => void;
    _fbq: any;
  }
}

// ── Client-side Pixel Events ──

export function trackPageView() {
  if (typeof window !== 'undefined' && window.fbq) {
    window.fbq('track', 'PageView');
  }
}

export function trackViewContent(params?: {
  content_name?: string;
  content_category?: string;
  content_ids?: string[];
  value?: number;
  currency?: string;
}) {
  if (typeof window !== 'undefined' && window.fbq) {
    window.fbq('track', 'ViewContent', params);
  }
}

export function trackLead(params?: {
  content_name?: string;
  content_category?: string;
  value?: number;
  currency?: string;
}) {
  if (typeof window !== 'undefined' && window.fbq) {
    window.fbq('track', 'Lead', params);
  }
}

export function trackCompleteRegistration(params?: {
  content_name?: string;
  value?: number;
  currency?: string;
  status?: string;
}) {
  if (typeof window !== 'undefined' && window.fbq) {
    window.fbq('track', 'CompleteRegistration', params);
  }
}

export function trackSubscribe(params?: {
  value?: number;
  currency?: string;
  predicted_ltv?: number;
}) {
  if (typeof window !== 'undefined' && window.fbq) {
    window.fbq('track', 'Subscribe', params);
  }
}

export function trackStartTrial(params?: {
  value?: number;
  currency?: string;
  predicted_ltv?: number;
}) {
  if (typeof window !== 'undefined' && window.fbq) {
    window.fbq('track', 'StartTrial', params);
  }
}

export function trackPurchase(params?: {
  value?: number;
  currency?: string;
  content_name?: string;
  content_ids?: string[];
  num_items?: number;
}) {
  if (typeof window !== 'undefined' && window.fbq) {
    window.fbq('track', 'Purchase', params);
  }
}

export function trackAddPaymentInfo(params?: {
  value?: number;
  currency?: string;
  content_category?: string;
}) {
  if (typeof window !== 'undefined' && window.fbq) {
    window.fbq('track', 'AddPaymentInfo', params);
  }
}

export function trackCustom(eventName: string, params?: Record<string, any>) {
  if (typeof window !== 'undefined' && window.fbq) {
    window.fbq('trackCustom', eventName, params);
  }
}

// ── Server-side CAPI call (via our backend) ──

export async function sendServerEvent(eventName: string, params: {
  email?: string;
  score?: number;
  tier?: string;
  step?: number;
  sourceUrl?: string;
}) {
  const BASE = (import.meta.env.VITE_API_URL || '') + '/api';
  try {
    await fetch(`${BASE}/quiz/event`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eventName,
        ...params,
        sourceUrl: params.sourceUrl || window.location.href,
        userAgent: navigator.userAgent,
        fbp: getCookie('_fbp'),
        fbc: getCookie('_fbc'),
      }),
    });
  } catch {
    // Silent fail — don't break the quiz flow
  }
}

function getCookie(name: string): string | undefined {
  const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
  return match ? match[2] : undefined;
}
