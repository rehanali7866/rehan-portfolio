// Vaults delivery: Stripe checkout.session.completed -> email the download links via Resend.
// Zero dependencies (Node 18+ built-ins). Env: STRIPE_WEBHOOK_SECRET, RESEND_API_KEY, VAULTS_DL_TOKEN.
const crypto = require('crypto');
const deliveries = require('../data/deliveries.json');

const SITE = 'https://ravolution.agency';
const FROM = 'Raki at Ravolution <rehan@ravolution.agency>';
const REPLY_TO = 'rehan@ravolution.agency';
const TOLERANCE_SEC = 300;

module.exports.config = { api: { bodyParser: false } };

function readRaw(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function verify(raw, header, secret) {
  if (!header || !secret) return false;
  const parts = Object.fromEntries(header.split(',').map((kv) => kv.split('=').map((s) => s.trim())));
  const t = parts.t;
  const sigs = header.split(',').filter((kv) => kv.trim().startsWith('v1=')).map((kv) => kv.trim().slice(3));
  if (!t || !sigs.length) return false;
  if (Math.abs(Date.now() / 1000 - Number(t)) > TOLERANCE_SEC) return false;
  const expected = crypto.createHmac('sha256', secret).update(`${t}.${raw.toString('utf8')}`).digest('hex');
  return sigs.some((s) => s.length === expected.length && crypto.timingSafeEqual(Buffer.from(s, 'hex'), Buffer.from(expected, 'hex')));
}

function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function buildEmail(items, name) {
  const token = process.env.VAULTS_DL_TOKEN;
  const first = name ? name.split(' ')[0] : '';
  const linksHtml = items.map((it) => {
    const files = it.files.map((f) => `<a href="${SITE}/dl/${token}/${f.file}" style="color:#e8102e;font-weight:700">${esc(f.label)}</a>`).join(' &nbsp;·&nbsp; ');
    return `<p style="margin:0 0 14px"><strong>${esc(it.title)}</strong><br/>${files}</p>`;
  }).join('');
  const linksText = items.map((it) => `${it.title}\n` + it.files.map((f) => `  ${f.label}: ${SITE}/dl/${token}/${f.file}`).join('\n')).join('\n\n');
  const subject = items.length === 1 ? `Your download: ${items[0].title}` : `Your Ravolution Vaults downloads`;
  const html = `<!doctype html><html><body style="margin:0;padding:0;background:#d1c7bd;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#15120f">
<div style="max-width:560px;margin:0 auto;padding:36px 24px">
<p style="font-size:12px;letter-spacing:.18em;color:#8f2d07;font-weight:700;margin:0 0 18px">RAVOLUTION VAULTS</p>
<h1 style="font-size:24px;line-height:1.2;margin:0 0 16px">${first ? `Thanks, ${esc(first)}.` : 'Thanks.'} Here's your download.</h1>
<p style="margin:0 0 22px;line-height:1.55">Payment cleared, so the guide is yours. It's a PDF that opens on any phone, tablet or laptop. This link doesn't expire &mdash; keep this email.</p>
${linksHtml}
<p style="margin:26px 0 0;padding-top:18px;border-top:1px solid rgba(21,18,15,.18);font-size:13px;line-height:1.6;color:#504842">
Every Vault guide carries a 30-day money-back guarantee &mdash; if it isn't what you expected, reply to this email within 30 days to request a refund.
Lost this email later? <a href="${SITE}/vaults/account/" style="color:#15120f">Your Library</a> will resend it.</p>
<p style="margin:18px 0 0;font-size:13px;color:#504842">&mdash; Raki<br/>ravolution.agency</p>
</div></body></html>`;
  const text = `${first ? `Thanks, ${first}.` : 'Thanks.'} Here's your download.\n\nPayment cleared, so the guide is yours. It's a PDF that opens on any phone, tablet or laptop. This link doesn't expire - keep this email.\n\n${linksText}\n\n30-day money-back guarantee: reply to this email if it isn't what you expected.\nLost this email later? ${SITE}/vaults/account/ will resend it.\n\n- Raki\nravolution.agency`;
  return { subject, html, text };
}

async function sendEmail(to, name, items) {
  const { subject, html, text } = buildEmail(items, name);
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json', 'User-Agent': 'ravolution-vaults/1.0' },
    body: JSON.stringify({ from: FROM, to: [to], reply_to: REPLY_TO, subject, html, text, tags: [{ name: 'venture', value: 'vaults' }] }),
  });
  const body = await r.text();
  if (!r.ok) throw new Error(`resend ${r.status}: ${body.slice(0, 300)}`);
  return JSON.parse(body);
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).send('Method Not Allowed'); }
  const raw = await readRaw(req);
  if (!verify(raw, req.headers['stripe-signature'], process.env.STRIPE_WEBHOOK_SECRET)) {
    return res.status(400).send('Bad signature');
  }
  let event;
  try { event = JSON.parse(raw.toString('utf8')); } catch { return res.status(400).send('Bad JSON'); }

  if (event.type !== 'checkout.session.completed') return res.status(200).json({ ignored: event.type });
  const session = event.data && event.data.object;
  if (!session || session.payment_status !== 'paid') return res.status(200).json({ ignored: 'not paid' });

  const slugs = String((session.metadata && session.metadata.slug) || '').split(',').map((s) => s.trim()).filter(Boolean);
  const items = slugs.map((s) => deliveries[s]).filter(Boolean);
  const to = (session.customer_details && session.customer_details.email) || session.customer_email;
  const name = session.customer_details && session.customer_details.name;

  if (!items.length) { console.error('no deliverable for slugs', slugs, session.id); return res.status(200).json({ ignored: 'no deliverable', slugs }); }
  if (!to) { console.error('no customer email on session', session.id); return res.status(200).json({ ignored: 'no email' }); }
  if (!process.env.RESEND_API_KEY || !process.env.VAULTS_DL_TOKEN) { console.error('delivery env missing'); return res.status(500).send('Delivery not configured'); }

  try {
    const sent = await sendEmail(to, name, items);
    console.log('delivered', session.id, to, slugs.join(','), sent.id);
    return res.status(200).json({ delivered: true, id: sent.id });
  } catch (err) {
    console.error('delivery failed', session.id, err.message);
    return res.status(500).send('Delivery failed'); // Stripe retries on 5xx
  }
};
