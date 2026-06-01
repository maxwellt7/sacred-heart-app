import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_INTERVAL_MIN,
  intervalToCron,
} from './knowledge-base-scheduler.js';

test('DEFAULT_INTERVAL_MIN polls every 5 minutes so new Dropbox files surface quickly', () => {
  // Previously 30 min; user-facing latency between "I dropped a file in
  // Dropbox" and "the chat can use it" was too long. 5 min is well under
  // any Dropbox rate-limit concern.
  assert.equal(DEFAULT_INTERVAL_MIN, 5);
});

test('intervalToCron with no override produces a 5-minute cron expression', () => {
  assert.equal(intervalToCron(undefined), '*/5 * * * *');
  assert.equal(intervalToCron(null), '*/5 * * * *');
});

test('intervalToCron clamps to the [5, 720] window', () => {
  // Below the minimum: clamp up to 5.
  assert.equal(intervalToCron(1), '*/5 * * * *');
  assert.equal(intervalToCron(0), '*/5 * * * *');
  // Within range: respected.
  assert.equal(intervalToCron(15), '*/15 * * * *');
  // Hourly special-case.
  assert.equal(intervalToCron(60), '0 * * * *');
  // Above the maximum: clamp down to 720 (12 hours).
  assert.equal(intervalToCron(10_000), '0 */12 * * *');
});
