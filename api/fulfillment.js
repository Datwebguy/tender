import crypto from 'node:crypto';
import { createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

const escrowAbi = [{
  type: 'function', name: 'capture', stateMutability: 'nonpayable',
  inputs: [{ name: 'orderId', type: 'bytes32' }, { name: 'merchant', type: 'address' }], outputs: [],
}];

function bodyText(req) {
  if (typeof req.body === 'string') return req.body;
  if (req.body) return JSON.stringify(req.body);
  return '';
}

function validSignature(rawBody, supplied, secret) {
  if (!supplied || !secret) return false;
  const expected = `sha256=${crypto.createHmac('sha256', secret).update(rawBody).digest('hex')}`;
  const left = Buffer.from(expected);
  const right = Buffer.from(String(supplied));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  const rawBody = bodyText(req);
  if (!validSignature(rawBody, req.headers['x-tender-signature'], process.env.TENDER_WEBHOOK_SECRET)) return res.status(401).json({ error: 'invalid_signature' });
  let payload;
  try { payload = JSON.parse(rawBody); } catch { return res.status(400).json({ error: 'invalid_json' }); }
  if (!payload.orderId) return res.status(400).json({ error: 'orderId_required' });
  if (!process.env.TENDER_MERCHANT_PRIVATE_KEY || !process.env.TENDER_ESCROW_ADDRESS) return res.status(503).json({ error: 'merchant_settlement_not_configured' });
  const account = privateKeyToAccount(process.env.TENDER_MERCHANT_PRIVATE_KEY);
  const merchant = process.env.TENDER_MERCHANT_ADDRESS || account.address;
  const wallet = createWalletClient({ account, chain: { id: 42431, name: 'Tempo Moderato', nativeCurrency: { name: 'USD', symbol: 'USD', decimals: 18 }, rpcUrls: { default: { http: ['https://rpc.moderato.tempo.xyz'] } } }, transport: http('https://rpc.moderato.tempo.xyz') });
  const txHash = await wallet.writeContract({ address: process.env.TENDER_ESCROW_ADDRESS, abi: escrowAbi, functionName: 'capture', args: [`0x${Buffer.from(payload.orderId).toString('hex').padEnd(64, '0').slice(0, 64)}`, merchant], account });
  return res.status(200).json({ orderId: payload.orderId, status: 'captured', txHash });
}
