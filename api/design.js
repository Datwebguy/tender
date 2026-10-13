import postgres from 'postgres';
import { createPublicClient, http, stringToHex, parseUnits } from 'viem';

let sql;
const supported = ['tender-brand-card', 'tender-launch-graphic'];
const abi = [{ type: 'function', name: 'orders', stateMutability: 'view', inputs: [{ type: 'bytes32' }], outputs: [{ type: 'address' }, { type: 'address' }, { type: 'address' }, { type: 'uint256' }, { type: 'uint64' }, { type: 'bool' }, { type: 'bool' }] }];
const escapeXml = (value) => value.replace(/[<>&"']/g, (char) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[char]));

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  if (!process.env.DATABASE_URL) return res.status(503).json({ error: 'storage_unavailable' });
  const { orderId, title, subtitle, color } = req.body || {};
  if (typeof title !== 'string' || !title.trim() || title.length > 32 || typeof subtitle !== 'string' || subtitle.length > 70 || !/^#[0-9a-f]{6}$/i.test(color || '')) return res.status(400).json({ error: 'Enter a title (up to 32 characters), subtitle (up to 70), and a valid color.' });
  try {
    if (!sql) sql = postgres(process.env.DATABASE_URL, { ssl: 'require', max: 1, connect_timeout: 10 });
    const [order] = await sql`SELECT id, product_id, amount, deadline FROM tender_orders WHERE id = ${String(orderId || '')}`;
    if (!order || !supported.includes(order.product_id)) return res.status(404).json({ error: 'design_order_not_found' });
    if (new Date(order.deadline).getTime() < Date.now()) return res.status(403).json({ error: 'This design session has expired. Create a new order.' });
    const address = process.env.TENDER_ESCROW_ADDRESS || process.env.VITE_TENDER_ESCROW_ADDRESS;
    if (!address) return res.status(503).json({ error: 'escrow_not_configured' });
    const client = createPublicClient({ transport: http('https://rpc.moderato.tempo.xyz') });
    const chain = await client.readContract({ address, abi, functionName: 'orders', args: [stringToHex(order.id, { size: 32 })] });
    const token = process.env.TENDER_TEMPO_TOKEN_ADDRESS || process.env.VITE_TEMPO_TOKEN_ADDRESS || '0x20c0000000000000000000000000000000000000';
    const merchant = process.env.TENDER_MERCHANT_ADDRESS || process.env.VITE_TENDER_MERCHANT_ADDRESS;
    if (chain[0] === '0x0000000000000000000000000000000000000000' || chain[6] || chain[3] !== parseUnits(String(order.amount), 6) || chain[4] !== BigInt(Math.floor(new Date(order.deadline).getTime() / 1000)) || chain[2].toLowerCase() !== token.toLowerCase() || !merchant || chain[1].toLowerCase() !== merchant.toLowerCase()) return res.status(402).json({ error: 'Reserve this order payment on Tempo before downloading. Refunded orders cannot generate designs.' });
    const name = escapeXml(title.trim());
    const line = escapeXml(subtitle.trim());
    const launch = order.product_id === 'tender-launch-graphic';
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="${launch ? 1200 : 720}" viewBox="0 0 1200 ${launch ? 1200 : 720}"><rect width="1200" height="${launch ? 1200 : 720}" fill="#20211f"/><circle cx="1080" cy="${launch ? 180 : 80}" r="330" fill="${color}"/><circle cx="1080" cy="${launch ? 180 : 80}" r="215" fill="#20211f"/><circle cx="1080" cy="${launch ? 180 : 80}" r="110" fill="${color}"/><path d="M70 80h45v45H70zM126 80h45v45h-45zM70 136h45v45H70z" fill="${color}"/><text x="70" y="${launch ? 680 : 420}" font-family="Arial,Helvetica,sans-serif" font-size="${title.length > 20 ? 48 : 70}" font-weight="700" letter-spacing="-2" fill="#f7f7f2">${name}</text><text x="74" y="${launch ? 755 : 485}" font-family="Arial,Helvetica,sans-serif" font-size="${subtitle.length > 45 ? 22 : 28}" fill="#c5c8bb">${line}</text><path d="M70 ${launch ? 1050 : 600}h1060" stroke="#626657"/><circle cx="90" cy="${launch ? 1100 : 650}" r="10" fill="${color}"/><path d="M1080 ${launch ? 1110 : 660}l40-40m-40 0h40v40" stroke="${color}" stroke-width="5" fill="none"/></svg>`;
    return res.status(200).json({ orderId: order.id, generatedAt: new Date().toISOString(), format: 'SVG', template: order.product_id, svg });
  } catch { return res.status(502).json({ error: 'Could not verify payment or generate your design. Please retry.' }); }
}
