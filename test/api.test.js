import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';

process.env.TENDER_SIGNING_KEY = generateKeyPairSync('ed25519').privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64');
const { default: sign } = await import('../api/sign.js');
const { default: verify } = await import('../api/verify.js');

const token = '0x20c0000000000000000000000000000000000001';
const recipient = '0x1234567890abcdef1234567890abcdef12345678';
const payer = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const txHash = `0x${'cd'.repeat(32)}`;
const TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const input = { program: 'Acme', milestone: 'Fix bug', workType: 'bounty', recipient, amount: '1000', token, tokenSymbol: 'USD', decimals: 6, evidenceUrl: 'https://github.com/a/b/pull/1', network: 'tempo', txHash };

function mockChain({ amount = 1000000000n, status = '0x1', receipt = true } = {}) {
  globalThis.fetch = async (_url, init) => {
    const { method } = JSON.parse(init.body);
    const result = method === 'eth_getTransactionReceipt'
      ? (receipt ? { status, from: payer, blockNumber: '0x10', logs: [{ address: token, topics: [TOPIC, `0x${'0'.repeat(64)}`, `0x${recipient.slice(2).padStart(64, '0')}`], data: `0x${amount.toString(16).padStart(64, '0')}` }] } : null)
      : { timestamp: '0x6553f100' };
    return { ok: true, json: async () => ({ result }) };
  };
}
function call(handler, method, body) {
  return new Promise((resolve) => {
    const res = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(code) { this.code = code; return this; }, json(data) { resolve({ code: this.code, data }); return this; } };
    handler({ method, body }, res);
  });
}

test('signs a receipt only after the chain confirms it, and verifies the result', async () => {
  mockChain();
  const signed = await call(sign, 'POST', input);
  assert.equal(signed.code, 200);
  assert.equal(signed.data.record.payer, payer);
  assert.equal(signed.data.record.paidAt, '2023-11-14T22:13:20.000Z');
  const ok = await call(verify, 'POST', { record: signed.data.record, signature: signed.data.signature });
  assert.equal(ok.data.valid, true);
  const tampered = await call(verify, 'POST', { record: { ...signed.data.record, amount: '9999' }, signature: signed.data.signature });
  assert.equal(tampered.data.valid, false);
  const relabeled = await call(verify, 'POST', { record: { ...signed.data.record, milestone: 'Something else' }, signature: signed.data.signature });
  assert.equal(relabeled.data.valid, false);
});
test('refuses to sign a mismatched, unconfirmed or malformed receipt', async () => {
  mockChain({ amount: 1n });
  assert.equal((await call(sign, 'POST', input)).code, 422);
  mockChain({ receipt: false });
  assert.equal((await call(sign, 'POST', input)).code, 409);
  mockChain();
  assert.equal((await call(sign, 'POST', { ...input, txHash: 'nope' })).code, 400);
  assert.equal((await call(sign, 'POST', { ...input, network: 'evil' })).code, 400);
  assert.equal((await call(sign, 'GET')).code, 405);
});
