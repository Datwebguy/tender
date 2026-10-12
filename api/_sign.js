import { createPrivateKey, createPublicKey, sign, verify } from 'node:crypto';
import { canonicalPayload } from '../src/lib/signing.js';
import { matchesTokenTransfer } from '../src/lib/chain.js';
import { getNetwork, NETWORKS } from '../src/lib/networks.js';
import { isAddress, isTxHash, safeUrl } from '../src/lib/format.js';

export function loadKeys() {
  const raw = process.env.TENDER_SIGNING_KEY;
  if (!raw) return null;
  const privateKey = createPrivateKey({ key: Buffer.from(raw, 'base64'), format: 'der', type: 'pkcs8' });
  const publicKey = createPublicKey(privateKey);
  return { privateKey, publicKey, publicBase64: publicKey.export({ format: 'der', type: 'spki' }).toString('base64') };
}
export function signRecord(keys, record) {
  return sign(null, Buffer.from(canonicalPayload(record)), keys.privateKey).toString('base64url');
}
export function verifyRecord(keys, record, signature) {
  try { return verify(null, Buffer.from(canonicalPayload(record)), keys.publicKey, Buffer.from(String(signature), 'base64url')); }
  catch { return false; }
}
async function rpc(network, method, params) {
  const response = await fetch(network.rpc, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
  if (!response.ok) throw new Error(`${network.shortName} RPC returned ${response.status}.`);
  const body = await response.json();
  if (body.error) throw new Error(body.error.message || 'RPC error.');
  return body.result;
}
const clip = (value, max) => String(value ?? '').slice(0, max);

// The chain decides token, recipient, amount, payer and time. Only the labels (team, title, evidence link) are payer-supplied.
export async function buildVerifiedRecord(input) {
  if (!input || typeof input !== 'object') throw Object.assign(new Error('Missing receipt.'), { status: 400 });
  const decimals = Number(input.decimals);
  if (!NETWORKS[input.network]) throw Object.assign(new Error('Unsupported network.'), { status: 400 });
  if (!isTxHash(input.txHash) || !isAddress(input.token) || !isAddress(input.recipient) || !Number.isInteger(decimals) || decimals < 0 || decimals > 18) {
    throw Object.assign(new Error('Receipt fields are incomplete or invalid.'), { status: 400 });
  }
  const network = getNetwork(input.network);
  const receipt = await rpc(network, 'eth_getTransactionReceipt', [input.txHash]);
  if (!receipt) throw Object.assign(new Error('The transaction is not confirmed yet.'), { status: 409 });
  if (!matchesTokenTransfer(receipt, { ...input, decimals })) throw Object.assign(new Error('The on-chain transfer does not match this receipt.'), { status: 422 });
  const block = await rpc(network, 'eth_getBlockByNumber', [receipt.blockNumber, false]);
  const paidAt = block?.timestamp ? new Date(Number(BigInt(block.timestamp)) * 1000).toISOString() : '';
  if (!paidAt) throw Object.assign(new Error('Could not read the block time.'), { status: 502 });
  return {
    program: clip(input.program, 120), workType: clip(input.workType, 20), milestone: clip(input.milestone, 200),
    recipient: input.recipient, amount: clip(input.amount, 40), token: input.token, tokenSymbol: clip(input.tokenSymbol, 24), decimals,
    evidenceUrl: safeUrl(input.evidenceUrl) ? clip(input.evidenceUrl, 300) : '', network: input.network, txHash: input.txHash,
    payer: receipt.from || '', paidAt,
  };
}
