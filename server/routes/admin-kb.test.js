import test from 'node:test';
import assert from 'node:assert/strict';
import { syncKbHandler } from './admin-kb.js';

function makeRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

test('syncKbHandler returns the runSyncOnce summary as JSON on success', async () => {
  const fakeSync = async () => ({ listed: 3, ingested: 2, unchanged: 1, errors: [] });
  const res = makeRes();
  await syncKbHandler({ runSync: fakeSync })({}, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.ok, true);
  assert.deepEqual(res.body.summary, { listed: 3, ingested: 2, unchanged: 1, errors: [] });
});

test('syncKbHandler returns 503 when the sync is skipped because Dropbox is unconfigured', async () => {
  const fakeSync = async () => ({ skipped: 'dropbox not configured' });
  const res = makeRes();
  await syncKbHandler({ runSync: fakeSync })({}, res);
  assert.equal(res.statusCode, 503);
  assert.equal(res.body.ok, false);
  assert.equal(res.body.skipped, 'dropbox not configured');
});

test('syncKbHandler returns 500 when runSyncOnce throws', async () => {
  const fakeSync = async () => { throw new Error('dropbox token expired'); };
  const res = makeRes();
  await syncKbHandler({ runSync: fakeSync })({}, res);
  assert.equal(res.statusCode, 500);
  assert.equal(res.body.ok, false);
  assert.match(res.body.error, /dropbox token expired/);
});
