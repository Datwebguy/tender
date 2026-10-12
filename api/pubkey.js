import { loadKeys } from './_sign.js';

export default function handler(req, res) {
  const keys = loadKeys();
  if (!keys) return res.status(503).json({ error: 'Receipt signing is not configured on this deployment.' });
  return res.status(200).json({ algorithm: 'Ed25519', format: 'spki-der-base64', publicKey: keys.publicBase64 });
}
