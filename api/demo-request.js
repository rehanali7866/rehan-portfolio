// NeverMissed: a takeaway asks to try the live demo.
// The demo number is not in the page. After a visitor gives valid details, this returns the ready-to-send
// reply (with the number) that the page puts in the lead email to Rehan; he presses Reply in Zoho, pastes, sends.
// Zero dependencies.
const DEMO_DISPLAY = '0131 381 5621';

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
  // FormSubmit sits behind a bot check that blocks server requests, so the visitor's browser sends the
  // lead email itself (the route that has always worked). This only hands back the ready-to-send reply.
  return res.status(200).json({ success: true, subject: 'Your NeverMissed demo number', reply: readyReply(d) });
};
