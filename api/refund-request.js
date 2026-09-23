// Vaults: refund REQUEST form -> emails Rehan for approval. Nothing is refunded automatically.
// Rehan checks the request, refunds by hand in the Stripe dashboard, then replies to the customer.
// Zero dependencies. Env: RESEND_API_KEY.
const OWNER = 'rehan@ravolution.agency';
const FROM = 'Ravolution Vaults <rehan@ravolution.agency>';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function readJson(req) {
  if (req.body && typeof req.body === 'object') return Promise.resolve(req.body);
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (c) => { raw += c; if (raw.length > 20000) raw = raw.slice(0, 20000); });
    req.on('end', () => { try { resolve(JSON.parse(raw || '{}')); } catch { resolve({}); } });
    req.on('error', () => resolve({}));
  });
}

function clean(v, max) {
  return String(v == null ? '' : v).replace(/[\u0000-\u0008\u000b-\u001f]/g, '').trim().slice(0, max);
}

function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ success: false }); }

  const b = await readJson(req);
  if (b._honey) return res.status(200).json({ success: true }); // bot: pretend it worked

  const email = clean(b.email, 200);
  const guide = clean(b.guide, 200);
  const order = clean(b.order, 200);
  const reason = clean(b.reason, 3000);
  if (!EMAIL_RE.test(email)) return res.status(400).json({ success: false, message: 'email' });
  if (!guide) return res.status(400).json({ success: false, message: 'guide' });

  const stripeSearch = 'https://dashboard.stripe.com/search?query=' + encodeURIComponent(email);
  const when = new Date().toLocaleString('en-GB', { timeZone: 'Europe/London', dateStyle: 'medium', timeStyle: 'short' });
  const rows = [
    ['Customer email', email],
    ['Guide', guide],
    ['Order reference', order || '(not given)'],
    ['Reason', reason || '(not given)'],
    ['Received', when + ' UK time'],
  ];

  const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#f4efe9;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#15120f">
<div style="max-width:560px;margin:0 auto">
<p style="font-size:12px;letter-spacing:.18em;color:#8f2d07;font-weight:700;margin:0 0 12px">REFUND REQUEST &middot; NEEDS YOUR OK</p>
<h1 style="font-size:21px;margin:0 0 14px">Nothing has been refunded yet.</h1>
<table style="border-collapse:collapse;width:100%;font-size:14px;margin:0 0 20px">
${rows.map(([k, v]) => `<tr><td style="padding:8px 10px;border-bottom:1px solid #ddd3c8;color:#6b6159;white-space:nowrap;vertical-align:top">${esc(k)}</td><td style="padding:8px 10px;border-bottom:1px solid #ddd3c8;white-space:pre-wrap">${esc(v)}</td></tr>`).join('')}
</table>
<p style="margin:0 0 8px;font-weight:700">To approve</p>
<ol style="margin:0 0 18px;padding-left:20px;line-height:1.6">
<li><a href="${stripeSearch}" style="color:#e8102e;font-weight:700">Find their payment in Stripe</a>, open it and press <strong>Refund</strong>.</li>
<li>Reply to this email. It goes straight to the customer to confirm.</li>
</ol>
<p style="margin:0;font-size:13px;color:#6b6159">To decline, just reply to the customer and explain. Policy: ravolution.agency/refunds/</p>
</div></body></html>`;
  const text = `REFUND REQUEST - NEEDS YOUR OK. Nothing has been refunded yet.\n\n${rows.map(([k, v]) => `${k}: ${v}`).join('\n')}\n\nTo approve: find the payment in Stripe (${stripeSearch}), press Refund, then reply to this email to confirm with the customer.\nTo decline: reply and explain.`;

  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json', 'User-Agent': 'ravolution-vaults/1.0' },
      body: JSON.stringify({
        from: FROM, to: [OWNER], reply_to: email,
        subject: `Refund request: ${guide} (${email})`,
        html, text, tags: [{ name: 'venture', value: 'vaults' }, { name: 'type', value: 'refund_request' }],
      }),
    });
    if (!r.ok) return res.status(502).json({ success: false, message: 'send' });
  } catch {
    return res.status(502).json({ success: false, message: 'send' });
  }
  return res.status(200).json({ success: true });
};
