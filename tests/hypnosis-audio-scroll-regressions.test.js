import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const hypnosisPagePath = path.resolve(__dirname, '..', 'src', 'pages', 'Hypnosis.tsx');
const hypnosisPageSource = fs.readFileSync(hypnosisPagePath, 'utf8');

test('hypnosis audio generation keeps background music opt-in so scripted pauses are not masked by default', () => {
  assert.match(
    hypnosisPageSource,
    /<option value="">No music<\/option>/,
    'The hypnosis page should provide an explicit no-music choice so users can preserve clean spoken pacing when they do not want background ambience'
  );

  assert.doesNotMatch(
    hypnosisPageSource,
    /setSelectedMusic\(musicData\.tracks\[0\]\.filename\)/,
    'Background music should remain opt-in because automatically preselecting a track causes the mixer to fill scripted pause sections by default'
  );
});

test('hypnosis chat does not force-scroll the very first assistant bootstrap message out of view', () => {
  // The original bug: an unconditional scrollIntoView on every messages
  // change hid the top of the first assistant message on small screens
  // while the input was focused. Current code guards on
  // hasConversationStarted/loading; this assertion just prevents the bare
  // unguarded pattern from coming back.
  assert.doesNotMatch(
    hypnosisPageSource,
    /useEffect\(\(\) => \{\s*bottomRef\.current\?\.scrollIntoView\(\{ behavior: 'smooth' \}\);\s*\}, \[messages, loading\]\)/,
    'The chat view should not unconditionally scroll to the bottom on every initial message change'
  );
});
