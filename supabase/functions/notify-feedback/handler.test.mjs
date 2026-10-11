import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHandler } from './handler.mjs';

const feedbackId = 'fd000000-0000-4000-8000-000000000001';
const adminId = 'fd000000-0000-4000-8000-000000000002';
const secret = 'test-secret-with-at-least-32-characters';
const event = { type: 'INSERT', schema: 'public', table: 'feedback_email_notifications',
  record: { feedback_id: feedbackId, admin_user_id: adminId, recipient_email: 'attacker@example.invalid' } };
const settings = { FEEDBACK_EMAIL_ENABLED: 'true', FEEDBACK_WEBHOOK_SECRET: secret, SUPABASE_URL: 'https://db.example.invalid',
  SUPABASE_SERVICE_ROLE_KEY: 'server-key', RESEND_API_KEY: 'mail-key', FEEDBACK_EMAIL_FROM: 'Quiz <quiz@example.invalid>',
  QUIZ_APP_URL: 'https://example.invalid/quiz/' };
const request = (body = event, token = secret) => new Request('https://function.example.invalid', {
  method: 'POST', headers: { 'x-feedback-webhook-secret': token }, body: JSON.stringify(body),
});
function fixture({ kind = 'general', claim = true, providerStatus = 200, failStamp = false } = {}) {
  const calls = [];
  const handler = createHandler({ env: name => settings[name], fetch: async (url, options) => {
    const body = options.body ? JSON.parse(options.body) : null;
    calls.push({ url, body, options });
    if (url.includes('/rpc/')) return Response.json(claim ? [{ recipient_email: 'admin@example.invalid' }] : []);
    if (url.includes('/quiz_feedback?')) return Response.json([{ id: feedbackId, kind, question_id: kind === 'correction' ? 'Q069' : null,
      created_at: '2026-10-11T00:00:00Z', message: 'PRIVATE REPORT CONTENT' }]);
    if (url === 'https://api.resend.com/emails') return Response.json({ id: 'provider-id', message: 'secret provider details' }, { status: providerStatus });
    if (failStamp && body.status === 'sent') return new Response(null, { status: 500 });
    return new Response(null, { status: 204 });
  } });
  return { handler, calls };
}
test('rejects unauthorized requests before any database or mail access', async () => {
  const { handler, calls } = fixture();
  assert.equal((await handler(request(event, 'wrong'))).status, 401);
  assert.equal(calls.length, 0);
});
test('rejects wrong events and malformed IDs', async () => {
  const { handler, calls } = fixture();
  for (const body of [{ ...event, type: 'UPDATE' }, { ...event, table: 'quiz_feedback' },
    { ...event, record: { ...event.record, feedback_id: "' OR true" } }]) {
    assert.equal((await handler(request(body))).status, 400);
  }
  assert.equal(calls.length, 0);
});
for (const kind of ['general', 'correction']) test(`sends ${kind} alerts to the database recipient without report contents`, async () => {
  const { handler, calls } = fixture({ kind });
  assert.equal((await handler(request())).status, 200);
  const mail = calls.find(call => call.url === 'https://api.resend.com/emails');
  assert.deepEqual(mail.body.to, ['admin@example.invalid']);
  assert.ok(mail.body.text.includes('https://example.invalid/quiz/feedback.html'));
  assert.ok(!mail.body.text.includes('PRIVATE REPORT CONTENT'));
  assert.equal(mail.body.text.includes('review.html#Q069'), kind === 'correction');
  assert.equal(mail.options.headers['Idempotency-Key'], `quiz-feedback/${feedbackId}/${adminId}`);
  assert.equal(calls.at(-1).body.status, 'sent');
});
test('already claimed, sent, or revoked jobs do not send another email', async () => {
  const { handler, calls } = fixture({ claim: false });
  assert.equal((await handler(request())).status, 200);
  assert.equal(calls.length, 1);
});
test('provider failure remains retryable and does not expose response details', async () => {
  const { handler, calls } = fixture({ providerStatus: 429 });
  const response = await handler(request());
  assert.equal(response.status, 502);
  assert.deepEqual(await response.json(), { error: 'Email provider returned HTTP 429' });
  assert.equal(calls.at(-1).body.status, 'failed');
  assert.equal(calls.at(-1).body.processing_until, null);
});
test('a failed sent-status write leaves a retryable job with the same provider key', async () => {
  const { handler, calls } = fixture({ failStamp: true });
  assert.equal((await handler(request())).status, 502);
  assert.equal(calls.at(-1).body.status, 'failed');
});
test('missing configuration fails closed', async () => {
  let accesses = 0;
  const handler = createHandler({ env: name => name === 'FEEDBACK_EMAIL_ENABLED' ? 'true' : undefined,
    fetch: async () => { accesses++; } });
  assert.equal((await handler(request())).status, 503);
  assert.equal(accesses, 0);
});
test('notifications are off by default and only the literal true enables delivery', async () => {
  for (const enabled of [undefined, '', 'false', '0', '1', 'TRUE']) {
    let accesses = 0;
    const handler = createHandler({ env: name => name === 'FEEDBACK_EMAIL_ENABLED' ? enabled : settings[name],
      fetch: async () => { accesses++; } });
    const response = await handler(request());
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: 'disabled' });
    assert.equal(accesses, 0, 'Disabled delivery must not claim jobs or contact the provider');
  }
});
test('unexpected network errors do not disclose server secrets', async () => {
  const handler = createHandler({ env: name => settings[name], fetch: async () => { throw Error('server-key mail-key'); } });
  const response = await handler(request());
  assert.equal(response.status, 502);
  assert.deepEqual(await response.json(), { error: 'Notification delivery failed or timed out' });
});
test('oversized and malformed payloads never access services', async () => {
  const { handler, calls } = fixture();
  for (const [body, status] of [['{broken', 400], ['x'.repeat(16385), 413]]) {
    const response = await handler(new Request('https://function.example.invalid', {
      method: 'POST', headers: { 'x-feedback-webhook-secret': secret }, body,
    }));
    assert.equal(response.status, status);
  }
  assert.equal(calls.length, 0);
});
