// Shared by the browser and the serverless functions. The signature covers exactly these fields, in this order.
const SIGNED_FIELDS = ['program', 'workType', 'milestone', 'recipient', 'amount', 'token', 'tokenSymbol', 'decimals', 'evidenceUrl', 'network', 'txHash', 'payer', 'paidAt'];

export function canonicalPayload(record) {
  const payload = { v: 1 };
  SIGNED_FIELDS.forEach((key) => {
    const value = record?.[key];
    payload[key] = value === undefined || value === null ? '' : key === 'decimals' ? Number(value) : String(value).trim();
  });
  payload.recipient = payload.recipient.toLowerCase();
  payload.token = payload.token.toLowerCase();
  payload.txHash = payload.txHash.toLowerCase();
  payload.payer = payload.payer.toLowerCase();
  return JSON.stringify(payload);
}
export const SIGNED_RECORD_FIELDS = SIGNED_FIELDS;
