import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appPath = path.resolve(__dirname, '..', 'src', 'App.tsx');
const appSource = fs.readFileSync(appPath, 'utf8');

test('signed-in users reach the authenticated app via AuthProvider + ProtectedRoutes', () => {
  // The intent is to guard the post-signup flow: a signed-in user must
  // actually mount the auth context and the route tree, not be stranded
  // at the SignedIn boundary. (Whether a paywall gates *some* routes
  // inside ProtectedRoutes is a product policy and not asserted here.)
  assert.ok(
    appSource.includes('<SignedIn>'),
    'Expected SignedIn route block to exist in App.tsx'
  );

  assert.match(
    appSource,
    /<SignedIn>[\s\S]*?<AuthProvider>[\s\S]*?<ProtectedRoutes \/>/,
    'Expected SignedIn users to reach AuthProvider and ProtectedRoutes'
  );
});

test('top-level app shell does not disable vertical scrolling', () => {
  assert.ok(
    !appSource.includes("overflow: 'hidden'"),
    'The main App shell should not lock vertical scrolling with overflow hidden'
  );
});
