import test from 'node:test';
import assert from 'node:assert/strict';
import { toTokenUnits, transferCalldata, matchesTokenTransfer, decodeContractString } from '../src/lib/chain.js';
import { parsePrUrl, prKey, safeUrl, displayDate, safeJsonArray, getEvidenceUrl } from '../src/lib/format.js';
import { encodeShare, decodeShare, toShareRecord, isCheckableRecord } from '../src/lib/share.js';

const token = '0x20c0000000000000000000000000000000000001';
const recipient = '0x1234567890abcdef1234567890abcdef12345678';
const txHash = `0x${'ab'.repeat(32)}`;
const TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const receiptFor = (amount) => ({ status: '0x1', logs: [{ address: token, topics: [TOPIC, `0x${'0'.repeat(64)}`, `0x${recipient.slice(2).padStart(64, '0')}`], data: `0x${amount.toString(16).padStart(64, '0')}` }] });

test('toTokenUnits converts and validates', () => {
  assert.equal(toTokenUnits('1000', 6), 1000000000n);
  assert.equal(toTokenUnits('1.5', 6), 1500000n);
  assert.equal(toTokenUnits('0', 0), 0n);
  assert.throws(() => toTokenUnits('1.1234567', 6));
  assert.throws(() => toTokenUnits('-1', 6));
  assert.throws(() => toTokenUnits('1', 999999999));
  assert.throws(() => toTokenUnits('abc', 6));
});
test('transferCalldata encodes selector, recipient and amount', () => {
  const data = transferCalldata(recipient, 255n);
  assert.equal(data.length, 2 + 8 + 128);
  assert.ok(data.startsWith('0xa9059cbb'));
  assert.ok(data.endsWith('ff'));
});
test('matchesTokenTransfer checks token, recipient, amount and status', () => {
  const record = { token, recipient, amount: '1000', decimals: 6 };
  assert.equal(matchesTokenTransfer(receiptFor(1000000000n), record), true);
  assert.equal(matchesTokenTransfer(receiptFor(1000000001n), record), false);
  assert.equal(matchesTokenTransfer({ ...receiptFor(1000000000n), status: '0x0' }, record), false);
  assert.equal(matchesTokenTransfer(receiptFor(1000000000n), { ...record, decimals: 'abc' }), false);
  assert.equal(matchesTokenTransfer(null, record), false);
});
test('decodeContractString handles dynamic and bytes32 strings', () => {
  const dynamic = `0x${'20'.padStart(64, '0')}${'3'.padStart(64, '0')}${Buffer.from('USD').toString('hex').padEnd(64, '0')}`;
  assert.equal(decodeContractString(dynamic), 'USD');
  assert.equal(decodeContractString(`0x${Buffer.from('MKR').toString('hex').padEnd(64, '0')}`), 'MKR');
});
test('parsePrUrl / prKey', () => {
  assert.deepEqual(parsePrUrl('https://github.com/a/b/pull/12/files'), { owner: 'a', repo: 'b', number: '12' });
  assert.equal(parsePrUrl('https://github.com/a/b/issues/12'), null);
  assert.equal(prKey('https://github.com/Acme/Repo/pull/7'), prKey('https://github.com/acme/repo/pull/7/commits'));
});
test('safeUrl rejects javascript: and non-strings', () => {
  assert.equal(safeUrl('javascript:alert(1)'), '');
  assert.equal(safeUrl({}), '');
  assert.equal(safeUrl('https://github.com/x'), 'https://github.com/x');
  assert.equal(getEvidenceUrl({ evidenceUrl: 'javascript:1', prUrl: 'https://github.com/a/b/pull/1' }), 'https://github.com/a/b/pull/1');
});
test('displayDate tolerates garbage', () => { assert.equal(displayDate('nope'), '—'); assert.equal(displayDate(undefined), '—'); });
test('safeJsonArray tolerates corrupt storage', () => {
  assert.deepEqual(safeJsonArray('{"a":1}'), []);
  assert.deepEqual(safeJsonArray('not json'), []);
  assert.deepEqual(safeJsonArray('[1,{"a":1},null]'), [{ a: 1 }]);
});
test('share round trip drops private fields', () => {
  const record = { id: 'x', reviewer: '0xdead', reviewedAt: 'now', createdAt: 'then', program: 'Acme', milestone: 'Fix', recipient, amount: '5', token, decimals: 6, network: 'tempo', txHash, workEvidence: { title: 'T', author: 'a', avatar: 'secret' } };
  const decoded = decodeShare(encodeShare(record));
  assert.equal(decoded.program, 'Acme');
  assert.equal(decoded.id, undefined);
  assert.equal(decoded.reviewer, undefined);
  assert.equal(decoded.workEvidence.author, 'a');
  assert.equal(decoded.workEvidence.avatar, undefined);
  assert.equal(decodeShare('%%%'), null);
  assert.equal(toShareRecord(null) && Object.keys(toShareRecord(null)).length, 0);
});
test('isCheckableRecord requires well-formed fields', () => {
  const good = { txHash, token, recipient, decimals: 6 };
  assert.equal(isCheckableRecord(good), true);
  assert.equal(isCheckableRecord({ ...good, decimals: 1e9 }), false);
  assert.equal(isCheckableRecord({ ...good, txHash: 'x' }), false);
});
