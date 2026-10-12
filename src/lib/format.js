export function shortAddress(value = '') { return typeof value === 'string' && value ? `${value.slice(0, 6)}…${value.slice(-4)}` : ''; }
export function displayDate(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
}
export function isWebUrl(value) {
  try { const url = new URL(value); return url.protocol === 'https:' || url.protocol === 'http:'; }
  catch { return false; }
}
// Returns the URL only when it is a plain http(s) link, so untrusted receipt data can never become a javascript: href.
export function safeUrl(value) { return typeof value === 'string' && isWebUrl(value) ? value : ''; }
export function parsePrUrl(value) {
  const match = String(value || '').trim().match(/^https:\/\/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)(?:[/?#].*)?$/i);
  return match ? { owner: match[1], repo: match[2], number: match[3] } : null;
}
export function prKey(value) {
  const pr = parsePrUrl(value);
  return pr ? `${pr.owner}/${pr.repo}#${pr.number}`.toLowerCase() : '';
}
export function getEvidenceUrl(record) {
  return safeUrl(record?.evidenceUrl) || safeUrl(record?.prUrl);
}
export function isAddress(value) { return /^0x[a-fA-F0-9]{40}$/.test(value || ''); }
export function isTxHash(value) { return /^0x[a-fA-F0-9]{64}$/.test(value || ''); }
export function safeJsonArray(raw) {
  try { const parsed = JSON.parse(raw || '[]'); return Array.isArray(parsed) ? parsed.filter((item) => item && typeof item === 'object') : []; }
  catch { return []; }
}
