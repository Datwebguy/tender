import crypto from 'node:crypto';
import { createPublicClient, createWalletClient, defineChain, http, stringToHex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

const escrowAbi = [{
  type: 'function', name: 'capture', stateMutability: 'nonpayable',
  inputs: [{ name: 'orderId', type: 'bytes32' }, { name: 'merchant', type: 'address' }], outputs: [],
}];
const chain = defineChain({
  id: 42431,
  name: 'Tempo Moderato',
  nativeCurrency: { name: 'USD', symbol: 'USD', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc.moderato.tempo.xyz'] } },
});

export const config = { api: { bodyParser: false } };

async function bodyText(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf8');
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
  const rawBody = await bodyText(req);
  if (!validSignature(rawBody, req.headers['x-tender-signature'], process.env.TENDER_WEBHOOK_SECRET)) return res.status(401).json({ error: 'invalid_signature' });
  let payload;
  try { payload = JSON.parse(rawBody); } catch { return res.status(400).json({ error: 'invalid_json' }); }
  if (typeof payload.orderId !== 'string' || !/^TND-[0-9a-f]{28}$/i.test(payload.orderId)) return res.status(400).json({ error: 'valid_order_id_required' });
  if (!process.env.TENDER_MERCHANT_PRIVATE_KEY || !process.env.TENDER_ESCROW_ADDRESS) return res.status(503).json({ error: 'merchant_settlement_not_configured' });
  const account = privateKeyToAccount(process.env.TENDER_MERCHANT_PRIVATE_KEY);
  const merchant = process.env.TENDER_MERCHANT_ADDRESS || account.address;
  const wallet = createWalletClient({ account, chain, transport: http() });
  const txHash = await wallet.writeContract({ address: process.env.TENDER_ESCROW_ADDRESS, abi: escrowAbi, functionName: 'capture', args: [stringToHex(payload.orderId, { size: 32 }), merchant], account });
  const publicClient = createPublicClient({ chain, transport: http() });
  let receipt;
  try {
    receipt = await publicClient.waitForTransactionReceipt({ hash: txHash, timeout: 25_000 });
  } catch {
    return res.status(202).json({ orderId: payload.orderId, status: 'submitted', confirmation: 'pending', txHash });
  }
  if (receipt.status !== 'success') return res.status(502).json({ error: 'capture_transaction_reverted', txHash });
  return res.status(200).json({ orderId: payload.orderId, status: 'captured', txHash });
}
