import { loadKeys, verifyRecord } from './_sign.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ error: 'Use POST.' }); }
  const keys = loadKeys();
  if (!keys) return res.status(503).json({ error: 'Receipt signing is not configured on this deployment.' });
  let body = req.body;
  try { if (typeof body === 'string') body = JSON.parse(body); } catch { return res.status(400).json({ error: 'Invalid JSON.' }); }
  return res.status(200).json({ valid: Boolean(body?.record && body?.signature && verifyRecord(keys, body.record, body.signature)), publicKey: keys.publicBase64 });
}
