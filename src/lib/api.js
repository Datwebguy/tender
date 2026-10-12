async function post(path, body) {
  const response = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  let data = null;
  try { data = await response.json(); } catch { /* non-JSON error page */ }
  if (!response.ok) throw new Error(data?.error || `Tender signing service returned ${response.status}.`);
  return data;
}
export function requestSignature(record) { return post('/api/sign', record); }
export async function checkSignature(record, signature) { return (await post('/api/verify', { record, signature })).valid === true; }
