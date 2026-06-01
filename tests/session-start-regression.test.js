import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const authProviderPath = path.resolve(__dirname, '..', 'src', 'components', 'AuthProvider.tsx');
const authProviderSource = fs.readFileSync(authProviderPath, 'utf8');

const hypnosisRoutePath = path.resolve(__dirname, '..', 'server', 'routes', 'hypnosis.js');
const hypnosisRouteSource = fs.readFileSync(hypnosisRoutePath, 'utf8');

test('auth token getter is registered before the hypnosis page mount effect can start a session', () => {
  assert.match(
    authProviderSource,
    /useLayoutEffect\(\(\) => \{[\s\S]*?setAuthTokenGetter\(getToken\)/,
    'AuthProvider must register the Clerk token getter in a layout effect so protected page mount effects do not fire unauthenticated requests on first render'
  );
});

test('hypnosis init reuses an existing same-day session even when it has no saved messages yet', () => {
  // The previous regression was: init gated session reuse on chat_messages
  // being present, so opening the app twice on the same day created a fresh
  // session and orphaned the first one. The fix was to short-circuit when
  // any same-day session exists, regardless of whether the user has typed
  // anything yet.
  assert.doesNotMatch(
    hypnosisRouteSource,
    /if\s*\(\s*existing\s*&&\s*existing\.chat_messages\s*\)/,
    'The init route must not require chat_messages before reusing today\'s session'
  );

  // The reuse path must exist: getTodaySession is called and, if it returns
  // a session, the response is built from it instead of falling through to
  // createSession. Allow extra args (the current signature takes a tz).
  assert.match(
    hypnosisRouteSource,
    /getTodaySession\(\s*\w+\s*(?:,[^)]*)?\)/,
    'init must call getTodaySession to find a same-day session'
  );
  assert.match(
    hypnosisRouteSource,
    /getTodaySession\([\s\S]*?\)[\s\S]{0,200}?if\s*\(\s*session\s*\)/,
    'init must short-circuit on the existing same-day session before creating a new one'
  );
});
