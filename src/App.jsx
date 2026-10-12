import { useEffect, useMemo, useState } from 'react';
const TEMPO = {
  id: 42431,
  name: 'Tempo Moderato',
  nativeCurrency: { name: 'USD', symbol: 'USD', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc.moderato.tempo.xyz'] } },
  blockExplorers: { default: { name: 'Tempo Explorer', url: 'https://explore.tempo.xyz' } },
};
const CHAIN_HEX = '0xa5bf';
const STORAGE_KEY = 'tender.closeouts.v1';

function readRecords() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); }
  catch { return []; }
}
function shortAddress(value = '') { return value ? `${value.slice(0, 6)}…${value.slice(-4)}` : ''; }
function displayDate(value) {
  return value ? new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value)) : '—';
}
function parsePrUrl(value) {
  const match = value.trim().match(/^https:\/\/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)(?:\/.*)?$/i);
  return match ? { owner: match[1], repo: match[2], number: match[3] } : null;
}
function encodeShare(record) {
  const bytes = new TextEncoder().encode(JSON.stringify(record));
  let binary = '';
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}
function decodeShare(value) {
  try {
    const padded = value.replaceAll('-', '+').replaceAll('_', '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch { return null; }
}
function getProvider() { return window.ethereum; }
function isAddress(value) { return /^0x[a-fA-F0-9]{40}$/.test(value || ''); }
function toTokenUnits(value, decimals) {
  const match = String(value).trim().match(/^(\d+)(?:\.(\d+))?$/);
  if (!match || (match[2] || '').length > decimals) throw new Error(`Enter an amount with no more than ${decimals} decimal places.`);
  const scale = 10n ** BigInt(decimals);
  return BigInt(match[1]) * scale + BigInt((match[2] || '').padEnd(decimals, '0') || '0');
}
function transferCalldata(recipient, amount) {
  return `0xa9059cbb${recipient.slice(2).toLowerCase().padStart(64, '0')}${amount.toString(16).padStart(64, '0')}`;
}
async function getTempoReceipt(hash) {
  const response = await fetch(TEMPO.rpcUrls.default.http[0], {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getTransactionReceipt', params: [hash] }),
  });
  if (!response.ok) throw new Error(`Tempo RPC returned ${response.status}.`);
  const result = await response.json();
  if (result.error) throw new Error(result.error.message || 'Tempo RPC error.');
  return result.result;
}
async function waitForTempoReceipt(hash) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const receipt = await getTempoReceipt(hash);
    if (receipt) return receipt;
    await new Promise((resolve) => window.setTimeout(resolve, 3000));
  }
  throw new Error(`Tempo has not confirmed the transaction yet: ${hash}`);
}

function Icon({ name, size = 18 }) {
  const shared = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true };
  const paths = {
    mark: <><path d="M4 7.5 12 3l8 4.5v9L12 21l-8-4.5z" /><path d="m4.5 7.8 7.5 4.4 7.5-4.4M12 12.2V21" /></>,
    plus: <><path d="M12 5v14M5 12h14" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    arrow: <><path d="M5 12h14M13 6l6 6-6 6" /></>,
    external: <><path d="M14 4h6v6M20 4l-9 9" /><path d="M18 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h6" /></>,
    file: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6M8 13h8M8 17h8" /></>,
    wallet: <><rect x="3" y="5" width="18" height="15" rx="2"/><path d="M3 9h18M16 15h.01"/><path d="M7 5V3h11" /></>,
    search: <><circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 4.5 4.5"/></>,
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    close: <><path d="m6 6 12 12M18 6 6 18"/></>,
  };
  return <svg {...shared}>{paths[name]}</svg>;
}

function ReceiptPage({ record }) {
  const [verification, setVerification] = useState(record?.txHash ? 'checking' : 'none');
  useEffect(() => {
    if (!record?.txHash) return;
    getTempoReceipt(record.txHash)
      .then((receipt) => setVerification(receipt?.status === '0x1' ? 'confirmed' : receipt ? 'failed' : 'pending'))
      .catch(() => setVerification('pending'));
  }, [record?.txHash]);
  if (!record) return <main className="receipt-page"><div className="receipt-card"><Brand /><h1>Receipt not found</h1><p>This link may be incomplete. Ask the grant team to send it again.</p></div></main>;
  return <main className="receipt-page">
    <div className="receipt-card">
      <Brand />
      <div className={`receipt-mark ${verification === 'confirmed' ? 'is-confirmed' : ''}`}><Icon name={verification === 'confirmed' ? 'check' : 'file'} size={24}/></div>
      <p className="eyebrow">MILESTONE CLOSEOUT</p>
      <h1>{record.milestone || 'Grant payment'}</h1>
      <p className="receipt-program">{record.program || 'Grant program'}</p>
      <div className="receipt-amount">{record.amount} <span>stablecoin</span></div>
      <div className="receipt-lines">
        <div><span>Recipient</span><strong>{shortAddress(record.recipient)}</strong></div>
        <div><span>GitHub evidence</span>{record.prUrl ? <a href={record.prUrl} target="_blank" rel="noreferrer">View pull request <Icon name="external" size={14}/></a> : <strong>Not attached</strong>}</div>
        <div><span>Payment date</span><strong>{displayDate(record.paidAt)}</strong></div>
        <div><span>Network</span><strong>Tempo Moderato</strong></div>
        <div><span>On-chain status</span><strong className={verification === 'confirmed' ? 'positive' : ''}>{verification === 'checking' ? 'Checking transaction…' : verification === 'confirmed' ? 'Confirmed' : verification === 'failed' ? 'Failed' : verification === 'pending' ? 'Not confirmed yet' : 'No transaction attached'}</strong></div>
      </div>
      {record.txHash && <a className="explorer-link" href={`https://explore.tempo.xyz/tx/${record.txHash}`} target="_blank" rel="noreferrer">Open transaction in Tempo Explorer <Icon name="external" size={15}/></a>}
      <p className="receipt-note">Shared by the grant program. Payment status is checked against Tempo.</p>
    </div>
  </main>;
}

function Brand() {
  return <div className="brand"><span className="brand-mark"><Icon name="mark" size={21}/></span><span>Tender</span></div>;
}

function App() {
  const receiptData = new URLSearchParams(window.location.search).get('receipt');
  const sharedRecord = receiptData ? decodeShare(receiptData) : null;
  const [records, setRecords] = useState(readRecords);
  const [selectedId, setSelectedId] = useState(records[0]?.id || null);
  const [wallet, setWallet] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');
  const [prDetails, setPrDetails] = useState({});
  const [reviewed, setReviewed] = useState(false);
  const [form, setForm] = useState({ program: '', milestone: '', recipient: '', amount: '', token: '', decimals: '6', prUrl: '' });

  useEffect(() => { localStorage.setItem(STORAGE_KEY, JSON.stringify(records)); }, [records]);
  useEffect(() => {
    if (selectedId && !records.some((item) => item.id === selectedId)) setSelectedId(records[0]?.id || null);
  }, [records, selectedId]);
  const selected = records.find((item) => item.id === selectedId) || null;
  const pendingCount = records.filter((item) => item.status !== 'paid').length;
  const paidCount = records.filter((item) => item.status === 'paid').length;
  const paidTotal = useMemo(() => records.filter((item) => item.status === 'paid').reduce((total, item) => total + (Number(item.amount) || 0), 0), [records]);

  if (receiptData) return <ReceiptPage record={sharedRecord}/>;

  async function connectWallet() {
    const provider = getProvider();
    if (!provider) { setNotice('Install an EVM wallet such as MetaMask to connect.'); return; }
    try {
      const accounts = await provider.request({ method: 'eth_requestAccounts' });
      setWallet(accounts[0] || '');
      const chainId = await provider.request({ method: 'eth_chainId' });
      if (chainId.toLowerCase() !== CHAIN_HEX) {
        try { await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: CHAIN_HEX }] }); }
        catch (error) {
          if (error.code !== 4902) throw error;
          await provider.request({ method: 'wallet_addEthereumChain', params: [{ chainId: CHAIN_HEX, chainName: TEMPO.name, nativeCurrency: TEMPO.nativeCurrency, rpcUrls: TEMPO.rpcUrls.default.http, blockExplorerUrls: [TEMPO.blockExplorers.default.url] }] });
        }
      }
      setNotice('Wallet connected to Tempo Moderato.');
    } catch (error) { setNotice(error.message || 'Wallet connection was cancelled.'); }
  }

  async function checkPullRequest(record) {
    const parsed = parsePrUrl(record.prUrl || '');
    if (!parsed) { setNotice('Add a public GitHub pull request URL to check its status.'); return; }
    setBusy(`pr-${record.id}`); setNotice(''); setReviewed(false);
    try {
      const response = await fetch(`https://api.github.com/repos/${parsed.owner}/${parsed.repo}/pulls/${parsed.number}`, { headers: { Accept: 'application/vnd.github+json' } });
      if (!response.ok) throw new Error(response.status === 404 ? 'Pull request not found. Check that the repository is public and the URL is correct.' : response.status === 403 ? 'GitHub rate limit reached. Try again in a few minutes.' : `GitHub returned ${response.status}.`);
      const pr = await response.json();
      setPrDetails((current) => ({ ...current, [record.id]: { title: pr.title, merged: Boolean(pr.merged), mergedAt: pr.merged_at, author: pr.user?.login, url: pr.html_url, base: pr.base?.repo?.full_name } }));
      setNotice(pr.merged ? 'GitHub confirms this pull request was merged. Review the work before approving payment.' : 'This pull request is not merged yet. Tender will not enable payment.');
    } catch (error) { setNotice(error.message || 'Could not check the pull request.'); }
    finally { setBusy(''); }
  }

  function createRecord(event) {
    event.preventDefault(); setFormError('');
    const decimals = Number(form.decimals);
    if (!form.program.trim() || !form.milestone.trim()) return setFormError('Add the grant program and milestone name.');
    if (!isAddress(form.recipient)) return setFormError('Enter a valid recipient wallet address.');
    if (!isAddress(form.token)) return setFormError('Enter the TIP-20 token contract address.');
    if (!Number.isInteger(decimals) || decimals < 0 || decimals > 18) return setFormError('Token decimals must be a whole number from 0 to 18.');
    try { if (toTokenUnits(form.amount, decimals) <= 0n) return setFormError('Enter a payment amount greater than zero.'); }
    catch (error) { return setFormError(error.message); }
    if (!parsePrUrl(form.prUrl)) return setFormError('Enter a public GitHub pull request URL.');
    const record = { id: crypto.randomUUID(), ...form, decimals, status: 'review', createdAt: new Date().toISOString() };
    setRecords((current) => [record, ...current]); setSelectedId(record.id); setDialogOpen(false); setReviewed(false); setPrDetails({});
    setForm({ program: '', milestone: '', recipient: '', amount: '', token: '', decimals: '6', prUrl: '' });
    setNotice('Milestone added. Check its GitHub pull request before reviewer approval.');
  }

  async function payMilestone(record) {
    const provider = getProvider();
    if (!provider) { setNotice('Install an EVM wallet such as MetaMask to make a Tempo testnet payment.'); return; }
    const detail = prDetails[record.id];
    if (!detail?.merged || !reviewed) { setNotice('Check that the PR is merged, then confirm your review before paying.'); return; }
    if (!isAddress(record.recipient) || !isAddress(record.token)) { setNotice('The recipient or TIP-20 token address is invalid.'); return; }
    setBusy(`pay-${record.id}`); setNotice('');
    try {
      let accounts = await provider.request({ method: 'eth_accounts' });
      if (!accounts?.length) accounts = await provider.request({ method: 'eth_requestAccounts' });
      const account = accounts[0]; setWallet(account);
      const chainId = await provider.request({ method: 'eth_chainId' });
      if (chainId.toLowerCase() !== CHAIN_HEX) throw new Error('Switch your wallet to Tempo Moderato before paying.');
      const amount = toTokenUnits(record.amount, record.decimals);
      const data = transferCalldata(record.recipient, amount);
      const txHash = await provider.request({ method: 'eth_sendTransaction', params: [{ from: account, to: record.token, data, value: '0x0' }] });
      setNotice('Transaction submitted. Waiting for Tempo confirmation…');
      const receipt = await waitForTempoReceipt(txHash);
      if (receipt.status !== '0x1') throw new Error(`Transaction failed. View it in the explorer: ${txHash}`);
      const paidAt = new Date().toISOString();
      setRecords((current) => current.map((item) => item.id === record.id ? { ...item, status: 'paid', txHash, paidAt, reviewer: account, reviewedAt: paidAt, githubEvidence: detail } : item));
      setReviewed(false); setNotice('Payment confirmed on Tempo. The closeout receipt is ready to share.');
    } catch (error) { setNotice(error.message || 'Payment could not be completed.'); }
    finally { setBusy(''); }
  }

  async function shareReceipt(record) {
    const url = new URL(window.location.href);
    url.search = `?receipt=${encodeShare(record)}`;
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(url.toString());
      setNotice('Shareable receipt link copied.');
    } catch { setNotice(url.toString()); }
  }

  function downloadReceipt(record) {
    const evidence = prDetails[record.id] || record.githubEvidence || null;
    const payload = { product: 'Tender', version: 1, program: record.program, milestone: record.milestone, recipient: record.recipient, amount: record.amount, token: record.token, tokenDecimals: record.decimals, githubEvidence: evidence, reviewer: record.reviewer || null, reviewedAt: record.reviewedAt || null, txHash: record.txHash || null, paidAt: record.paidAt || null, network: 'Tempo Moderato', chainId: TEMPO.id, recordCreatedAt: record.createdAt };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const anchor = document.createElement('a'); anchor.href = URL.createObjectURL(blob); anchor.download = `tender-${record.milestone.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-closeout.json`; anchor.click(); URL.revokeObjectURL(anchor.href);
  }

  const currentPr = selected ? prDetails[selected.id] : null;
  return <div className="app-shell">
    <aside className="sidebar">
      <Brand />
      <div className="workspace-switch"><div className="workspace-avatar">{records[0]?.program?.[0]?.toUpperCase() || 'T'}</div><div><strong>{records[0]?.program || 'Your workspace'}</strong><span>Grant operations</span></div><span className="switch-chevron">⌄</span></div>
      <p className="nav-label">WORKSPACE</p>
      <button className="nav-item active"><span className="nav-icon"><Icon name="file"/></span>Milestones<span className="nav-count">{records.length}</span></button>
      <button className="nav-item" onClick={() => setNotice('Payments appear here as milestones are paid.')}><span className="nav-icon"><Icon name="wallet"/></span>Payments</button>
      <div className="sidebar-bottom"><div className="network-indicator"><span className="network-dot"/><div><strong>Tempo Moderato</strong><span>Test network</span></div></div><div className="profile-row"><div className="profile-avatar">{wallet ? wallet.slice(2, 4).toUpperCase() : 'DW'}</div><div className="profile-copy"><strong>{wallet ? shortAddress(wallet) : 'Grant reviewer'}</strong><span>{wallet ? 'Wallet connected' : 'Connect wallet to pay'}</span></div><button className="tiny-menu" aria-label="Account menu">···</button></div></div>
    </aside>

    <main className="main-area">
      <header className="topbar"><div className="breadcrumb"><span>Workspace</span><span className="crumb-slash">/</span><strong>Milestones</strong></div><div className="topbar-actions"><span className="top-network"><span className="network-dot"/>Tempo Moderato</span><button className={`wallet-button ${wallet ? 'connected' : ''}`} onClick={connectWallet}><Icon name="wallet" size={16}/>{wallet ? shortAddress(wallet) : 'Connect wallet'}</button></div></header>
      <div className="content-wrap">
        <div className="page-heading"><div><p className="eyebrow">GRANT OPERATIONS</p><h1>Milestones</h1><p className="page-subtitle">Review work, release funds, and keep the closeout in one place.</p></div><button className="primary-button" onClick={() => { setFormError(''); setDialogOpen(true); }}><Icon name="plus" size={17}/> New milestone</button></div>
        <section className="stats-grid" aria-label="Grant summary">
          <div className="stat-card"><div className="stat-top"><span>Awaiting closeout</span><span className="stat-icon amber"><Icon name="clock" size={17}/></span></div><strong>{pendingCount}</strong><span className="stat-foot">Milestones in review</span></div>
          <div className="stat-card"><div className="stat-top"><span>Paid on Tempo</span><span className="stat-icon green"><Icon name="check" size={17}/></span></div><strong>{paidCount}</strong><span className="stat-foot">Confirmed transactions</span></div>
          <div className="stat-card"><div className="stat-top"><span>Total released</span><span className="stat-icon blue"><Icon name="arrow" size={17}/></span></div><strong>{paidTotal.toLocaleString(undefined, { maximumFractionDigits: 2 })}</strong><span className="stat-foot">Across recorded milestones</span></div>
        </section>
        <section className="workspace-grid">
          <div className="list-panel">
            <div className="panel-heading"><div><h2>Milestone closeouts</h2><p>Evidence, review, and payment status</p></div><button className="filter-button" aria-label="Search milestones" onClick={() => setNotice('Search is coming soon.')}><Icon name="search" size={17}/></button></div>
            {records.length === 0 ? <div className="empty-state"><div className="empty-icon"><Icon name="file" size={23}/></div><h3>No milestones yet</h3><p>Add a funded milestone to review its GitHub work and prepare payment.</p><button className="secondary-button" onClick={() => setDialogOpen(true)}><Icon name="plus" size={16}/> Add your first milestone</button></div> : <div className="milestone-list">{records.map((item) => <button key={item.id} className={`milestone-row ${selectedId === item.id ? 'selected' : ''}`} onClick={() => { setSelectedId(item.id); setNotice(''); setReviewed(false); }}><span className={`row-status ${item.status === 'paid' ? 'done' : ''}`}>{item.status === 'paid' ? <Icon name="check" size={14}/> : <span/>}</span><span className="row-main"><strong>{item.milestone}</strong><span>{item.program} · {shortAddress(item.recipient)}</span></span><span className="row-amount">{item.amount}</span><span className={`status-pill ${item.status === 'paid' ? 'paid' : 'needs-review'}`}>{item.status === 'paid' ? 'Paid' : 'Needs review'}</span><Icon className="row-arrow" name="arrow" size={16}/></button>)}</div>}
            <div className="panel-footer"><span>{records.length} {records.length === 1 ? 'milestone' : 'milestones'}</span><span>Records saved in this browser</span></div>
          </div>

          <section className="detail-panel">
            {selected ? <>
              <div className="detail-head"><div><p className="eyebrow">CLOSEOUT DETAILS</p><h2>{selected.milestone}</h2><p>{selected.program}</p></div><span className={`status-pill ${selected.status === 'paid' ? 'paid' : 'needs-review'}`}>{selected.status === 'paid' ? 'Paid' : 'Needs review'}</span></div>
              <div className="detail-amount"><span>Milestone payment</span><strong>{selected.amount}</strong><small>TIP-20 token · {shortAddress(selected.token)}</small></div>
              <div className="detail-section"><div className="section-title"><h3>Recipient</h3><button className="copy-text" onClick={() => navigator.clipboard?.writeText(selected.recipient).then(() => setNotice('Recipient address copied.'))}>Copy address</button></div><a className="address-card" href={`https://explore.tempo.xyz/address/${selected.recipient}`} target="_blank" rel="noreferrer"><span className="address-avatar">{selected.recipient.slice(2, 4).toUpperCase()}</span><span><strong>{shortAddress(selected.recipient)}</strong><small>View wallet on Tempo <Icon name="external" size={12}/></small></span><Icon name="external" size={15}/></a></div>
              <div className="detail-section"><div className="section-title"><h3>GitHub evidence</h3><span className={`evidence-state ${currentPr?.merged ? 'confirmed' : ''}`}><span/> {currentPr?.merged ? 'Merged' : currentPr ? 'Not merged' : 'Not checked'}</span></div><a className="evidence-card" href={selected.prUrl} target="_blank" rel="noreferrer"><span className="github-mark">GH</span><span className="evidence-copy"><strong>{currentPr?.title || parsePrUrl(selected.prUrl)?.repo || 'Pull request'}</strong><small>{selected.prUrl.replace('https://github.com/', '')}</small></span><Icon name="external" size={15}/></a><button className="check-pr-button" disabled={busy === `pr-${selected.id}`} onClick={() => checkPullRequest(selected)}><Icon name="search" size={15}/>{busy === `pr-${selected.id}` ? 'Checking GitHub…' : 'Check pull request status'}</button>{currentPr?.merged && <div className="pr-meta"><span><Icon name="check" size={14}/> Merged {displayDate(currentPr.mergedAt)}</span>{currentPr.author && <span>by @{currentPr.author}</span>}</div>}</div>
              {selected.status === 'paid' ? <div className="paid-card"><div className="paid-heading"><span className="paid-check"><Icon name="check" size={17}/></span><div><strong>Payment confirmed</strong><small>{displayDate(selected.paidAt)} · Tempo Moderato</small></div></div><a className="tx-link" href={`https://explore.tempo.xyz/tx/${selected.txHash}`} target="_blank" rel="noreferrer">{shortAddress(selected.txHash)} <Icon name="external" size={14}/></a><div className="receipt-actions"><button className="secondary-button" onClick={() => shareReceipt(selected)}>Share recipient receipt</button><button className="icon-action" title="Download closeout record" onClick={() => downloadReceipt(selected)}><Icon name="file" size={17}/></button></div></div> : <div className="approval-box"><div className="approval-title"><span className="step-index">1</span><div><strong>Review and release</strong><small>Confirm the work before sending funds.</small></div></div>{currentPr?.merged ? <label className="review-check"><input type="checkbox" checked={reviewed} onChange={(event) => setReviewed(event.target.checked)}/><span>I reviewed the merged pull request and approve this milestone.</span></label> : <p className="review-hint">Check that the public pull request is merged to enable reviewer approval.</p>}<button className="pay-button" disabled={!currentPr?.merged || !reviewed || Boolean(busy)} onClick={() => payMilestone(selected)}>{busy === `pay-${selected.id}` ? 'Waiting for transaction…' : <><Icon name="wallet" size={16}/> Pay {selected.amount} on Tempo</>}</button><p className="pay-footnote">Your connected wallet will ask you to confirm the TIP-20 transfer.</p></div>}
              <div className="record-meta"><span>Created {displayDate(selected.createdAt)}</span><span>Chain ID {TEMPO.id}</span></div>
            </> : <div className="detail-empty"><div className="detail-empty-icon"><Icon name="arrow" size={21}/></div><h3>Select a milestone</h3><p>Choose a closeout from the list to review its evidence and payment details.</p></div>}
          </section>
        </section>
        {notice && <div className="notice" role="status"><span>{notice}</span><button aria-label="Dismiss notification" onClick={() => setNotice('')}><Icon name="close" size={15}/></button></div>}
        <footer className="page-footer"><span>Tender</span><span>Grant closeouts with a clear record.</span><a href="https://explore.tempo.xyz" target="_blank" rel="noreferrer">Tempo Explorer <Icon name="external" size={12}/></a></footer>
      </div>
    </main>

    {dialogOpen && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setDialogOpen(false); }}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="new-milestone-title"><div className="modal-heading"><div><p className="eyebrow">NEW CLOSEOUT</p><h2 id="new-milestone-title">Add a funded milestone</h2><p>Link the work and payment details for reviewer closeout.</p></div><button className="icon-action" onClick={() => setDialogOpen(false)} aria-label="Close"><Icon name="close"/></button></div><form onSubmit={createRecord}><div className="form-grid"><label className="field full"><span>Grant program</span><input value={form.program} onChange={(e) => setForm({ ...form, program: e.target.value })} placeholder="e.g. Ecosystem Grants" autoFocus/></label><label className="field full"><span>Milestone name</span><input value={form.milestone} onChange={(e) => setForm({ ...form, milestone: e.target.value })} placeholder="e.g. Public beta launch"/></label><label className="field full"><span>Recipient wallet</span><input value={form.recipient} onChange={(e) => setForm({ ...form, recipient: e.target.value })} placeholder="0x…" spellCheck="false"/></label><label className="field"><span>Payment amount</span><input value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="1000" inputMode="decimal"/></label><label className="field"><span>Token decimals</span><input value={form.decimals} onChange={(e) => setForm({ ...form, decimals: e.target.value })} placeholder="6" inputMode="numeric"/></label><label className="field full"><span>TIP-20 token contract</span><input value={form.token} onChange={(e) => setForm({ ...form, token: e.target.value })} placeholder="0x…" spellCheck="false"/><small>Use the token contract address for Tempo Moderato.</small></label><label className="field full"><span>GitHub pull request</span><input value={form.prUrl} onChange={(e) => setForm({ ...form, prUrl: e.target.value })} placeholder="https://github.com/org/repo/pull/42" spellCheck="false"/><small>Public pull requests only in this first cut.</small></label></div>{formError && <p className="form-error">{formError}</p>}<div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setDialogOpen(false)}>Cancel</button><button type="submit" className="primary-button">Add milestone <Icon name="arrow" size={16}/></button></div></form></section></div>}
  </div>;
}

export default App;
