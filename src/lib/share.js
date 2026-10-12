import { isAddress, isTxHash } from './format.js';

// Only what a receipt needs. Reviewer wallet, internal ids and local timestamps stay out of shared links.
const SHARE_FIELDS = ['program', 'workType', 'milestone', 'recipient', 'amount', 'token', 'tokenSymbol', 'decimals', 'evidenceUrl', 'network', 'txHash', 'paidAt'];
const EVIDENCE_FIELDS = ['title', 'author', 'authorUrl', 'mergedAt', 'merged', 'url', 'additions', 'deletions', 'changedFiles'];

export function toShareRecord(record) {
  const out = {};
  SHARE_FIELDS.forEach((key) => { if (record?.[key] !== undefined && record[key] !== null && record[key] !== '') out[key] = record[key]; });
  if (record?.workEvidence) {
    out.workEvidence = {};
    EVIDENCE_FIELDS.forEach((key) => { if (record.workEvidence[key] !== undefined) out.workEvidence[key] = record.workEvidence[key]; });
  }
  return out;
}
export function encodeShare(record) {
  const bytes = new TextEncoder().encode(JSON.stringify(toShareRecord(record)));
  let binary = '';
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}
export function decodeShare(value) {
  try {
    const padded = value.replaceAll('-', '+').replaceAll('_', '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const record = JSON.parse(new TextDecoder().decode(bytes));
    return record && typeof record === 'object' && !Array.isArray(record) ? record : null;
  } catch { return null; }
}
// A receipt is only checkable on-chain when these fields are well formed; anything else renders as "details do not match".
export function isCheckableRecord(record) {
  const decimals = Number(record?.decimals);
  return isTxHash(record?.txHash) && isAddress(record?.token) && isAddress(record?.recipient)
    && Number.isInteger(decimals) && decimals >= 0 && decimals <= 18;
}
