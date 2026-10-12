import { loadKeys, signRecord, buildVerifiedRecord } from './_sign.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ error: 'Use POST.' }); }
  const keys = loadKeys();
  if (!keys) return res.status(503).json({ error: 'Receipt signing is not configured on this deployment.' });
  try {
    const record = await buildVerifiedRecord(typeof req.body === 'string' ? JSON.parse(req.body) : req.body);
    return res.status(200).json({ record, signature: signRecord(keys, record), publicKey: keys.publicBase64 });
  } catch (error) {
    return res.status(error.status || 502).json({ error: error.message || 'Could not sign this receipt.' });
  }
}
