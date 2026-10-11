const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const json = (status, body) => Response.json(body, { status });

async function sameSecret(value, expected) {
  if (!value || !expected) return false;
  const digest = text => crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  const [a, b] = await Promise.all([digest(value), digest(expected)]);
  const left = new Uint8Array(a), right = new Uint8Array(b);
  let difference = 0;
  for (let i = 0; i < left.length; i++) difference |= left[i] ^ right[i];
  return difference === 0;
}

export function createHandler({ env, fetch: fetcher }) {
  return async request => {
    if (request.method !== 'POST') return json(405, { error: 'POST required' });
    // Fail closed: email delivery is opt-in at the server, never controlled by the browser.
    if (env('FEEDBACK_EMAIL_ENABLED') !== 'true') return json(200, { status: 'disabled' });
    const secret = env('FEEDBACK_WEBHOOK_SECRET');
    if (!secret || secret.length < 32) return json(503, { error: 'Notification service is not configured' });
    if (!await sameSecret(request.headers.get('x-feedback-webhook-secret'), secret)) return json(401, { error: 'Unauthorized' });

    let event;
    try {
      const body = await request.text();
      if (body.length > 16384) return json(413, { error: 'Payload too large' });
      event = JSON.parse(body);
    } catch { return json(400, { error: 'Invalid JSON' }); }
    if (event?.type !== 'INSERT' || event.schema !== 'public' || event.table !== 'feedback_email_notifications'
      || !uuid.test(event.record?.feedback_id || '') || !uuid.test(event.record?.admin_user_id || '')) {
      return json(400, { error: 'Invalid notification event' });
    }

    const url = env('SUPABASE_URL'), key = env('SUPABASE_SERVICE_ROLE_KEY');
    const apiKey = env('RESEND_API_KEY'), from = env('FEEDBACK_EMAIL_FROM'), app = env('QUIZ_APP_URL');
    if (!url || !key || !apiKey || !from || !app) return json(503, { error: 'Notification service is not configured' });
    let adminUrl, reviewUrl;
    try {
      const base = new URL(app.endsWith('/') ? app : app + '/');
      if (base.protocol !== 'https:') throw Error();
      adminUrl = new URL('feedback.html', base).href;
      reviewUrl = new URL('review.html', base);
    } catch { return json(503, { error: 'Invalid app URL configuration' }); }

    const feedbackId = event.record.feedback_id, adminId = event.record.admin_user_id;
    const filter = `feedback_id=eq.${feedbackId}&admin_user_id=eq.${adminId}`;
    const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
    async function database(path, options = {}) {
      const response = await fetcher(`${url.replace(/\/$/, '')}/rest/v1/${path}`, {
        ...options, headers: { ...headers, ...options.headers }, signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) throw Error('Database request failed');
      return response.status === 204 ? null : response.json();
    }
    let job;
    try {
      const jobs = await database('rpc/claim_feedback_email', {
        method: 'POST', body: JSON.stringify({ p_feedback_id: feedbackId, p_admin_user_id: adminId }),
      });
      job = jobs[0];
      if (!job) return json(200, { status: 'already_sent_processing_or_ineligible' });
      const rows = await database(`quiz_feedback?id=eq.${feedbackId}&select=id,kind,question_id,created_at`);
      const feedback = rows[0];
      if (!feedback) return json(200, { status: 'feedback_removed' });
      const correction = feedback.kind === 'correction';
      const question = /^Q\d{3}$/.test(feedback.question_id || '') ? feedback.question_id : null;
      const subject = correction ? `แจ้งแก้ไขข้อสอบใหม่${question ? ' · ' + question : ''} · แบบฝึกหัด ป.5` : 'ความคิดเห็นใหม่ · แบบฝึกหัด ป.5';
      const lines = [correction ? 'มีรายงานขอตรวจทาน/แก้ไขข้อสอบใหม่' : 'มีคำแนะนำติชมใหม่',
        `รหัสรายงาน: ${feedback.id}`, `วันที่ส่ง: ${feedback.created_at}`, '', `จัดการรายงาน (ต้องเข้าสู่ระบบผู้ดูแล): ${adminUrl}`];
      if (question) { reviewUrl.hash = question; lines.push(`ตรวจทานข้อ ${question}: ${reviewUrl.href}`); }
      lines.push('', 'ข้อความฉบับเต็มอยู่ในหน้าผู้ดูแล ไม่แนบข้อมูลผู้ส่งหรือข้อความส่วนตัวในอีเมลนี้');
      const mail = await fetcher('https://api.resend.com/emails', {
        method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json',
          'Idempotency-Key': `quiz-feedback/${feedbackId}/${adminId}` },
        // Recipient always comes from the claimed database job, never from the request body.
        body: JSON.stringify({ from, to: [job.recipient_email], subject, text: lines.join('\n') }),
        signal: AbortSignal.timeout(10000),
      });
      if (!mail.ok) throw Error(`Email provider returned HTTP ${mail.status}`);
      const result = await mail.json();
      if (typeof result.id !== 'string' || !result.id) throw Error('Email provider returned no message ID');
      await database(`feedback_email_notifications?${filter}`, {
        method: 'PATCH', body: JSON.stringify({ status: 'sent', sent_at: new Date().toISOString(),
          processing_until: null, provider_message_id: result.id, last_error: null }),
      });
      return json(200, { status: 'sent' });
    } catch (error) {
      // Record only controlled error messages; provider response bodies may contain addresses or secrets.
      const reason = /^(Database request failed|Email provider returned HTTP \d{3}|Email provider returned no message ID)$/.test(error.message)
        ? error.message : 'Notification delivery failed or timed out';
      if (job) {
        try { await database(`feedback_email_notifications?${filter}`, { method: 'PATCH',
          body: JSON.stringify({ status: 'failed', processing_until: null, last_error: reason }) }); }
        catch { /* Lease expires if the database is unavailable; the job remains retryable. */ }
      }
      return json(502, { error: reason });
    }
  };
}
