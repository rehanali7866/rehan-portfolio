// NeverMissed: a takeaway asks to try the live demo.
// The demo number never reaches the browser. This function emails Rehan (via FormSubmit) the lead
// plus a ready-to-send reply that contains the number; he presses Reply in Zoho, pastes, sends.
// Zero dependencies.
const DEMO_DISPLAY = '0131 381 5621';
const FORM_ENDPOINT = 'https://formsubmit.co/ajax/2c5ecb72f1ee0224596c06758178d5aa';

function readJson(req) {
  if (req.body && typeof req.body === 'object') return Promise.resolve(req.body);
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (c) => { raw += c; if (raw.length > 5000) raw = raw.slice(0, 5000); });
    req.on('end', () => { try { resolve(JSON.parse(raw || '{}')); } catch { resolve({}); } });
    req.on('error', () => resolve({}));
  });
}

function clean(v, max) {
  return String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);
}

function first(n) { return String(n || '').split(/\s+/)[0]; }

function readyReply(d) {
  return [
    'Hi ' + first(d.name) + ',',
    '',
    'Thanks for asking to try NeverMissed for ' + d.shop + '.',
    '',
    'Here is the demo line: ' + DEMO_DISPLAY,
    '',
    "It answers as Tony's Takeaway, a made-up shop with a kebab, pizza and burger menu. Ring it and order like a normal customer: collection or delivery, cash or card. It reads your order back and sends the ticket to the kitchen printer.",
    '',
    'On your free week it answers with ' + d.shop + "'s name and your own menu.",
    '',
    "I'll give you a ring afterwards to hear what you thought.",
    '',
    'Rehan',
    'Ravolution | ravolution.agency',
  ].join('\n');
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ success: false }); }
  const b = await readJson(req);
  if (b._honey) return res.status(200).json({ success: true }); // bot: pretend it worked
  const d = {
    shop: clean(b.shop, 120), name: clean(b.name, 120), phone: clean(b.phone, 40),
    email: clean(b.email, 160), town: clean(b.town, 80),
  };
  if (d.shop.length < 2 || d.name.length < 2 || d.town.length < 2 ||
      !/^[\d\s+()-]{9,}$/.test(d.phone) || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(d.email)) {
    return res.status(400).json({ success: false, error: 'Please fill in every field.' });
  }
  const payload = {
    shop: d.shop, name: d.name, phone: d.phone, email: d.email, town: d.town,
    READY_REPLY_subject: 'Your NeverMissed demo number',
    READY_REPLY_press_Reply_then_paste_this: readyReply(d),
    _replyto: d.email,
    _subject: 'NeverMissed DEMO request - ' + d.shop + ' (send them the number)',
    _template: 'table', _captcha: 'false',
  };
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await fetch(FORM_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json', Accept: 'application/json',
          Origin: 'https://ravolution.agency', Referer: 'https://ravolution.agency/nevermissed/',
        },
        body: JSON.stringify(payload),
      });
      const j = await r.json().catch(() => ({}));
      if (r.ok && String(j.success) === 'true') return res.status(200).json({ success: true });
    } catch (e) { /* retry once */ }
  }
  return res.status(502).json({ success: false, error: 'Could not send right now.' });
};
