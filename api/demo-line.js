// NeverMissed: hands out the live demo number only after a visitor has given their shop details.
// The number lives here (server side), not in the page, so it can't be scraped from the HTML.
// The details themselves are emailed to Rehan by the page (FormSubmit) before this is called.
// Zero dependencies.
const DEMO = { tel: '+441313815621', display: '0131 381 5621' };

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
  return String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, '').trim().slice(0, max);
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ success: false }); }
  const b = await readJson(req);
  if (b._honey) return res.status(400).json({ success: false });
  const shop = clean(b.shop, 120);
  const name = clean(b.name, 120);
  const phone = clean(b.phone, 40);
  const town = clean(b.town, 80);
  if (shop.length < 2 || name.length < 2 || town.length < 2 || !/^[\d\s+()-]{9,}$/.test(phone)) {
    return res.status(400).json({ success: false, error: 'Please fill in every field.' });
  }
  return res.status(200).json({ success: true, tel: DEMO.tel, display: DEMO.display });
};
