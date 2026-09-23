// Vaults: on-site download after checkout.
// GET /api/order?session_id=cs_live_... -> asks Stripe whether that Checkout Session is paid,
// and if so returns the download links for whatever it bought (from data/deliveries.json).
// Zero dependencies. Env: STRIPE_SECRET_KEY (needs Checkout Sessions: read), VAULTS_DL_TOKEN.
const deliveries = require('../data/deliveries.json');

const SITE = 'https://ravolution.agency';
const SESSION_RE = /^cs_(live|test)_[A-Za-z0-9]{10,200}$/;

function maskEmail(e) {
  if (!e || e.indexOf('@') < 1) return null;
  const [user, domain] = e.split('@');
  return user.slice(0, 2) + '•••@' + domain;
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex');
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return res.status(405).json({ ok: false, error: 'method' }); }

  const id = String((req.query && req.query.session_id) || '');
  if (!SESSION_RE.test(id)) return res.status(400).json({ ok: false, error: 'bad_session' });

  const key = process.env.STRIPE_SECRET_KEY;
  const token = process.env.VAULTS_DL_TOKEN;
  if (!key || !token) return res.status(500).json({ ok: false, error: 'not_configured' });

  let session;
  try {
    const r = await fetch('https://api.stripe.com/v1/checkout/sessions/' + encodeURIComponent(id), {
      headers: { Authorization: 'Bearer ' + key },
    });
    if (r.status === 404) return res.status(404).json({ ok: false, error: 'not_found' });
    if (!r.ok) return res.status(502).json({ ok: false, error: 'stripe_' + r.status });
    session = await r.json();
  } catch (e) {
    return res.status(502).json({ ok: false, error: 'stripe_unreachable' });
  }

  if (session.payment_status !== 'paid') {
    return res.status(202).json({ ok: false, error: 'pending', status: session.payment_status });
  }

  const slugs = String((session.metadata && session.metadata.slug) || '')
    .split(',').map((s) => s.trim()).filter(Boolean);
  const items = slugs.filter((s) => deliveries[s]).map((s) => ({
    title: deliveries[s].title,
    files: deliveries[s].files.map((f) => ({ label: f.label, url: `${SITE}/dl/${token}/${f.file}` })),
  }));
  if (!items.length) return res.status(404).json({ ok: false, error: 'no_items' });

  return res.status(200).json({
    ok: true,
    email: maskEmail(session.customer_details && session.customer_details.email),
    items,
  });
};
