import { useEffect, useMemo, useState } from 'react';
const NETWORKS = {
  tempo: {
    id: 42431, chainHex: '0xa5bf', name: 'Tempo Moderato', shortName: 'Tempo',
    nativeCurrency: { name: 'USD', symbol: 'USD', decimals: 18 },
    rpc: 'https://rpc.moderato.tempo.xyz', explorer: 'https://explore.tempo.xyz',
    explorerName: 'Tempo Explorer', testnet: true,
  },
  robinhood: {
    id: 46630, chainHex: '0xb626', name: 'Robinhood Chain Testnet', shortName: 'Robinhood',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpc: 'https://rpc.testnet.chain.robinhood.com', explorer: 'https://explorer.testnet.chain.robinhood.com',
    explorerName: 'Robinhood Explorer', faucet: 'https://faucet.testnet.chain.robinhood.com', testnet: true,
  },
};
const WORK_TYPES = {
  grant: 'Grant milestone',
  bounty: 'Bounty',
  contract: 'Contributor contract',
  other: 'Other deliverable',
};
function getNetwork(key) { return NETWORKS[key] || NETWORKS.tempo; }
function getWorkType(key) { return WORK_TYPES[key] || WORK_TYPES.other; }
const STORAGE_KEY = 'tender.closeouts.v1';
const CONTRIBUTOR_KEY = 'tender.contributor-record.v1';

function readRecords() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); }
  catch { return []; }
}
function readContributorReceipts() {
  try { return JSON.parse(localStorage.getItem(CONTRIBUTOR_KEY) || '[]'); }
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
function getEvidenceUrl(record) { return record?.evidenceUrl || record?.prUrl || ''; }
function isWebUrl(value) {
  try { const url = new URL(value); return url.protocol === 'https:' || url.protocol === 'http:'; }
  catch { return false; }
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
async function getNetworkReceipt(hash, networkKey = 'tempo') {
  const network = getNetwork(networkKey);
  const response = await fetch(network.rpc, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getTransactionReceipt', params: [hash] }),
  });
  if (!response.ok) throw new Error(`${network.shortName} RPC returned ${response.status}.`);
  const result = await response.json();
  if (result.error) throw new Error(result.error.message || `${network.shortName} RPC error.`);
  return result.result;
}
function matchesTokenTransfer(receipt, record) {
  if (!receipt || receipt.status !== '0x1' || !isAddress(record?.token) || !isAddress(record?.recipient)) return false;
  try {
    const expected = toTokenUnits(record.amount, Number(record.decimals));
    const recipientTopic = `0x${record.recipient.slice(2).toLowerCase().padStart(64, '0')}`;
    return (receipt.logs || []).some((log) => log.address?.toLowerCase() === record.token.toLowerCase()
      && log.topics?.[0]?.toLowerCase() === '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
      && log.topics?.[2]?.toLowerCase() === recipientTopic
      && BigInt(log.data || '0x0') === expected);
  } catch { return false; }
}
async function waitForNetworkReceipt(hash, networkKey) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const receipt = await getNetworkReceipt(hash, networkKey);
    if (receipt) return receipt;
    await new Promise((resolve) => window.setTimeout(resolve, 3000));
  }
  throw new Error(`${getNetwork(networkKey).shortName} has not confirmed the transaction yet: ${hash}`);
}

async function switchWalletNetwork(provider, network) {
  const current = await provider.request({ method: 'eth_chainId' });
  if (current.toLowerCase() === network.chainHex) return;
  try {
    await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: network.chainHex }] });
  } catch (error) {
    if (error.code !== 4902) throw error;
    await provider.request({ method: 'wallet_addEthereumChain', params: [{
      chainId: network.chainHex, chainName: network.name, nativeCurrency: network.nativeCurrency,
      rpcUrls: [network.rpc], blockExplorerUrls: [network.explorer],
    }] });
  }
  const afterSwitch = await provider.request({ method: 'eth_chainId' });
  if (afterSwitch.toLowerCase() !== network.chainHex) throw new Error(`Switch your wallet to ${network.name} before continuing.`);
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
  const network = getNetwork(record?.network);
  const [verification, setVerification] = useState(record?.txHash ? 'checking' : 'none');
  const [saved, setSaved] = useState(() => Boolean(record?.txHash && readContributorReceipts().some((item) => item.txHash === record.txHash)));
  useEffect(() => {
    if (!record?.txHash) return;
    getNetworkReceipt(record.txHash, record.network || 'tempo')
      .then((receipt) => setVerification(matchesTokenTransfer(receipt, record) ? 'confirmed' : receipt ? 'failed' : 'pending'))
      .catch(() => setVerification('pending'));
  }, [record?.txHash, record?.recipient, record?.amount, record?.token, record?.decimals]);
  function saveToContributorRecord() {
    const savedReceipts = readContributorReceipts();
    if (!savedReceipts.some((item) => item.txHash === record.txHash)) {
      localStorage.setItem(CONTRIBUTOR_KEY, JSON.stringify([{ ...record, savedAt: new Date().toISOString() }, ...savedReceipts]));
    }
    setSaved(true);
  }
  if (!record) return <main className="receipt-page"><div className="receipt-card"><Brand /><h1>Receipt not found</h1><p>This link may be incomplete. Ask the payer to send it again.</p></div></main>;
  return <main className="receipt-page">
    <div className="receipt-card">
      <Brand />
      <div className={`receipt-mark ${verification === 'confirmed' ? 'is-confirmed' : ''}`}><Icon name={verification === 'confirmed' ? 'check' : 'file'} size={24}/></div>
      <p className="eyebrow">PAYOUT RECEIPT</p>
      <h1>{record.milestone || 'Work payout'}</h1>
      <p className="receipt-program">{record.program || 'Paying team'} · {getWorkType(record.workType)}</p>
      <div className="receipt-amount">{record.amount} <span>token</span></div>
      <div className="receipt-lines">
        <div><span>Recipient</span><strong>{shortAddress(record.recipient)}</strong></div>
        <div><span>Work evidence</span>{getEvidenceUrl(record) ? <a href={getEvidenceUrl(record)} target="_blank" rel="noreferrer">Open evidence <Icon name="external" size={14}/></a> : <strong>Not attached</strong>}</div>
        <div><span>Payment date</span><strong>{displayDate(record.paidAt)}</strong></div>
        <div><span>Network</span><strong>{network.name}</strong></div>
        <div><span>Token contract</span><strong>{shortAddress(record.token)}</strong></div>
        <div><span>On-chain status</span><strong className={verification === 'confirmed' ? 'positive' : ''}>{verification === 'checking' ? 'Checking token transfer…' : verification === 'confirmed' ? 'Transfer verified' : verification === 'failed' ? 'Transfer details do not match' : verification === 'pending' ? 'Not confirmed yet' : 'No transaction attached'}</strong></div>
      </div>
      {record.txHash && <a className="explorer-link" href={`${network.explorer}/tx/${record.txHash}`} target="_blank" rel="noreferrer">Open transaction in {network.explorerName} <Icon name="external" size={15}/></a>}
      {verification === 'confirmed' && <button className="primary-button receipt-save" onClick={saveToContributorRecord}>{saved ? 'Saved to your contributor record' : 'Save to my contributor record'}</button>}
      <p className="receipt-note">Tender checks the transaction receipt for a matching token, recipient, and amount. Save verified work to your local contributor record.</p>
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
  const [contributorReceipts, setContributorReceipts] = useState(readContributorReceipts);
  const [receiptChecks, setReceiptChecks] = useState({});
  const [view, setView] = useState('team');
  const [selectedId, setSelectedId] = useState(records[0]?.id || null);
  const [wallet, setWallet] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');
  const [prDetails, setPrDetails] = useState({});
  const [reviewed, setReviewed] = useState(false);
  const [form, setForm] = useState({ program: '', workType: 'bounty', milestone: '', recipient: '', amount: '', token: '', decimals: '6', evidenceUrl: '', network: 'tempo' });

  useEffect(() => { localStorage.setItem(STORAGE_KEY, JSON.stringify(records)); }, [records]);
  useEffect(() => { localStorage.setItem(CONTRIBUTOR_KEY, JSON.stringify(contributorReceipts)); }, [contributorReceipts]);
  useEffect(() => {
    let active = true;
    contributorReceipts.forEach((item) => {
      setReceiptChecks((current) => ({ ...current, [item.txHash]: 'checking' }));
      getNetworkReceipt(item.txHash, item.network || 'tempo')
        .then((receipt) => { if (active) setReceiptChecks((current) => ({ ...current, [item.txHash]: matchesTokenTransfer(receipt, item) ? 'verified' : 'unverified' })); })
        .catch(() => { if (active) setReceiptChecks((current) => ({ ...current, [item.txHash]: 'unavailable' })); });
    });
    return () => { active = false; };
  }, [contributorReceipts]);
  useEffect(() => {
    if (selectedId && !records.some((item) => item.id === selectedId)) setSelectedId(records[0]?.id || null);
  }, [records, selectedId]);
  const selected = records.find((item) => item.id === selectedId) || null;
  const selectedNetwork = getNetwork(selected?.network);
  const pendingCount = records.filter((item) => item.status !== 'paid').length;
  const paidCount = records.filter((item) => item.status === 'paid').length;
  const networksUsed = useMemo(() => new Set(records.map((item) => item.network || 'tempo')).size, [records]);

  if (receiptData) return <ReceiptPage record={sharedRecord}/>;

  async function connectWallet() {
    const provider = getProvider();
    if (!provider) { setNotice('Install an EVM wallet such as MetaMask to connect.'); return; }
    const network = getNetwork(selected?.network);
    try {
      const accounts = await provider.request({ method: 'eth_requestAccounts' });
      setWallet(accounts[0] || '');
      await switchWalletNetwork(provider, network);
      setNotice(`Wallet connected to ${network.name}.`);
    } catch (error) { setNotice(error.message || 'Wallet connection was cancelled.'); }
  }

  async function checkEvidence(record) {
    const url = getEvidenceUrl(record);
    if (!isWebUrl(url)) { setNotice('Add a valid public evidence link first.'); return; }
    const parsed = parsePrUrl(url);
    if (!parsed) {
      setNotice('Tender verifies public GitHub pull requests. Add a public PR link to continue.');
      return;
    }
    setBusy(`evidence-${record.id}`); setNotice(''); setReviewed(false);
    try {
      const response = await fetch(`https://api.github.com/repos/${parsed.owner}/${parsed.repo}/pulls/${parsed.number}`, { headers: { Accept: 'application/vnd.github+json' } });
      if (!response.ok) throw new Error(response.status === 404 ? 'Pull request not found. Check that the repository is public and the URL is correct.' : response.status === 403 ? 'GitHub rate limit reached. Try again in a few minutes.' : `GitHub returned ${response.status}.`);
      const pr = await response.json();
      setPrDetails((current) => ({ ...current, [record.id]: { kind: 'github_pr', checked: true, title: pr.title, merged: Boolean(pr.merged), mergedAt: pr.merged_at, author: pr.user?.login, url: pr.html_url, base: pr.base?.repo?.full_name } }));
      setNotice(pr.merged ? 'GitHub confirms this pull request was merged. Review the work before approving payment.' : 'This pull request is not merged yet. Tender will not enable payment.');
    } catch (error) { setNotice(error.message || 'Could not check the pull request.'); }
    finally { setBusy(''); }
  }

  function createRecord(event) {
    event.preventDefault(); setFormError('');
    const decimals = Number(form.decimals);
    if (!form.program.trim() || !form.milestone.trim()) return setFormError('Add your organization and a work item or deliverable.');
    if (!isAddress(form.recipient)) return setFormError('Enter a valid recipient wallet address.');
    if (!isAddress(form.token)) return setFormError('Enter the token contract address for the selected network.');
    if (!Number.isInteger(decimals) || decimals < 0 || decimals > 18) return setFormError('Token decimals must be a whole number from 0 to 18.');
    try { if (toTokenUnits(form.amount, decimals) <= 0n) return setFormError('Enter a payment amount greater than zero.'); }
    catch (error) { return setFormError(error.message); }
    if (!parsePrUrl(form.evidenceUrl)) return setFormError('Enter a public GitHub pull request URL. Tender uses the merged PR as the work record.');
    const record = { id: crypto.randomUUID(), ...form, decimals, status: 'review', createdAt: new Date().toISOString() };
    setRecords((current) => [record, ...current]); setSelectedId(record.id); setDialogOpen(false); setReviewed(false); setPrDetails({});
    setForm({ program: '', workType: 'bounty', milestone: '', recipient: '', amount: '', token: '', decimals: '6', evidenceUrl: '', network: 'tempo' });
    setNotice('Bounty payout created. Check the merged PR, review the work, then pay the contributor.');
  }

  async function payMilestone(record) {
    const provider = getProvider();
    const network = getNetwork(record.network);
    if (!provider) { setNotice('Install an EVM wallet such as MetaMask to make a testnet payment.'); return; }
    const detail = prDetails[record.id];
    if (!detail?.checked || (detail.kind === 'github_pr' && !detail.merged) || !reviewed) { setNotice('Review the work evidence and approve it before paying. GitHub pull requests must be merged.'); return; }
    if (!isAddress(record.recipient) || !isAddress(record.token)) { setNotice('The recipient or token contract address is invalid.'); return; }
    setBusy(`pay-${record.id}`); setNotice('');
    try {
      let accounts = await provider.request({ method: 'eth_accounts' });
      if (!accounts?.length) accounts = await provider.request({ method: 'eth_requestAccounts' });
      const account = accounts[0]; setWallet(account);
      await switchWalletNetwork(provider, network);
      const amount = toTokenUnits(record.amount, record.decimals);
      const data = transferCalldata(record.recipient, amount);
      const txHash = await provider.request({ method: 'eth_sendTransaction', params: [{ from: account, to: record.token, data, value: '0x0' }] });
      setNotice(`Transaction submitted. Waiting for ${network.shortName} confirmation…`);
      const receipt = await waitForNetworkReceipt(txHash, record.network || 'tempo');
      if (!matchesTokenTransfer(receipt, record)) throw new Error(`The confirmed transaction did not emit the expected token, recipient, and amount. Check it in the explorer: ${txHash}`);
      const paidAt = new Date().toISOString();
      setRecords((current) => current.map((item) => item.id === record.id ? { ...item, status: 'paid', txHash, paidAt, reviewer: account, reviewedAt: paidAt, workEvidence: detail } : item));
      setReviewed(false); setNotice(`Payment confirmed on ${network.shortName}. The payout receipt is ready to share.`);
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
    const evidence = prDetails[record.id] || record.workEvidence || null;
    const network = getNetwork(record.network);
    const payload = { product: 'Tender', version: 1, organization: record.program, workType: record.workType || 'grant', deliverable: record.milestone, recipient: record.recipient, amount: record.amount, token: record.token, tokenDecimals: record.decimals, evidenceUrl: getEvidenceUrl(record), workEvidence: evidence, reviewer: record.reviewer || null, reviewedAt: record.reviewedAt || null, txHash: record.txHash || null, paidAt: record.paidAt || null, network: network.name, chainId: network.id, recordCreatedAt: record.createdAt };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const anchor = document.createElement('a'); anchor.href = URL.createObjectURL(blob); anchor.download = `tender-${record.milestone.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-payout.json`; anchor.click(); URL.revokeObjectURL(anchor.href);
  }

  const currentEvidence = selected ? prDetails[selected.id] : null;
  return <div className="app-shell">
    <aside className="sidebar">
      <Brand />
      <div className="workspace-switch"><div className="workspace-avatar">{records[0]?.program?.[0]?.toUpperCase() || 'T'}</div><div><strong>{records[0]?.program || 'Tender'}</strong><span>Open-source payouts</span></div><span className="switch-chevron">⌄</span></div>
      <p className="nav-label">WORKSPACE</p>
      <button className={`nav-item ${view === 'team' ? 'active' : ''}`} onClick={() => setView('team')}><span className="nav-icon"><Icon name="file"/></span>Bounty payouts<span className="nav-count">{records.length}</span></button>
      <button className={`nav-item ${view === 'contributor' ? 'active' : ''}`} onClick={() => setView('contributor')}><span className="nav-icon"><Icon name="wallet"/></span>My work record<span className="nav-count">{contributorReceipts.length}</span></button>
      <div className="sidebar-bottom"><div className="network-indicator"><span className="network-dot"/><div><strong>{selectedNetwork.name}</strong><span>Test network</span></div></div><div className="profile-row"><div className="profile-avatar">{wallet ? wallet.slice(2, 4).toUpperCase() : 'DW'}</div><div className="profile-copy"><strong>{wallet ? shortAddress(wallet) : 'Payer wallet'}</strong><span>{wallet ? 'Wallet connected' : 'Connect wallet to pay'}</span></div><button className="tiny-menu" aria-label="Account menu">···</button></div></div>
    </aside>

    <main className="main-area">
      <header className="topbar"><div className="breadcrumb"><span>Tender</span><span className="crumb-slash">/</span><strong>{view === 'team' ? 'Bounty payouts' : 'My work record'}</strong></div><div className="topbar-actions"><span className="top-network"><span className="network-dot"/>{selectedNetwork.shortName}</span>{view === 'team' && <button className={`wallet-button ${wallet ? 'connected' : ''}`} onClick={connectWallet}><Icon name="wallet" size={16}/>{wallet ? shortAddress(wallet) : 'Connect payer wallet'}</button>}</div></header>
      <div className="content-wrap">
        {view === 'contributor' ? <>
          <div className="page-heading"><div><p className="eyebrow">YOUR OPEN-SOURCE WORK HISTORY</p><h1>My work record</h1><p className="page-subtitle">Receipts for completed work, rechecked against each payout network.</p></div><span className="record-count">{contributorReceipts.length} {contributorReceipts.length === 1 ? 'saved receipt' : 'saved receipts'}</span></div>
          <div className="record-intro"><div className="record-intro-mark"><Icon name="check" size={19}/></div><div><strong>Keep proof of paid work with you</strong><p>Open a Tender receipt and save it after its token, recipient, and amount match the on-chain transfer. This record stays in this browser; each receipt link remains shareable.</p></div></div>
          {contributorReceipts.length ? <div className="contributor-receipts">{contributorReceipts.map((item) => <article className="contributor-receipt" key={item.txHash}><div className="contributor-receipt-top"><span className={`verified-badge ${receiptChecks[item.txHash] === 'verified' ? '' : 'badge-pending'}`}><Icon name={receiptChecks[item.txHash] === 'verified' ? 'check' : 'clock'} size={13}/> {receiptChecks[item.txHash] === 'verified' ? 'On-chain verified' : receiptChecks[item.txHash] === 'unverified' ? 'Transfer not matched' : receiptChecks[item.txHash] === 'unavailable' ? 'Network unavailable' : 'Checking transfer'}</span><span>{displayDate(item.paidAt)}</span></div><h2>{item.milestone || item.workEvidence?.title || 'Open-source contribution'}</h2><p>{item.program || 'Paying team'} · {getWorkType(item.workType)} · {getNetwork(item.network).name}</p><div className="contributor-receipt-bottom"><strong>{item.amount} token</strong><a href={`${getNetwork(item.network).explorer}/tx/${item.txHash}`} target="_blank" rel="noreferrer">View transfer <Icon name="external" size={13}/></a></div><div className="contribution-actions">{getEvidenceUrl(item) && <a className="contribution-evidence" href={getEvidenceUrl(item)} target="_blank" rel="noreferrer">View merged contribution <Icon name="external" size={13}/></a>}<button onClick={() => shareReceipt(item)}>Share receipt</button></div></article>)}</div> : <div className="empty-state record-empty"><div className="empty-icon"><Icon name="file" size={23}/></div><h3>Your work record starts with a paid contribution</h3><p>When a team sends you a Tender receipt, open it and save the verified payout here.</p></div>}
        </> : <>
        <div className="page-heading"><div><p className="eyebrow">OPEN-SOURCE CONTRIBUTOR PAYOUTS</p><h1>Pay for merged work</h1><p className="page-subtitle">Review a contributor’s merged PR, send the bounty, and give them a receipt they can keep.</p></div><button className="primary-button" onClick={() => { setFormError(''); setDialogOpen(true); }}><Icon name="plus" size={17}/> New bounty payout</button></div>
        <section className="stats-grid" aria-label="Bounty payout summary">
          <div className="stat-card"><div className="stat-top"><span>Awaiting approval</span><span className="stat-icon amber"><Icon name="clock" size={17}/></span></div><strong>{pendingCount}</strong><span className="stat-foot">Work items in review</span></div>
          <div className="stat-card"><div className="stat-top"><span>Payments confirmed</span><span className="stat-icon green"><Icon name="check" size={17}/></span></div><strong>{paidCount}</strong><span className="stat-foot">Across supported networks</span></div>
          <div className="stat-card"><div className="stat-top"><span>Networks used</span><span className="stat-icon blue"><Icon name="arrow" size={17}/></span></div><strong>{networksUsed}</strong><span className="stat-foot">Testnet payout records</span></div>
        </section>
        <section className="workspace-grid">
          <div className="list-panel">
            <div className="panel-heading"><div><h2>Contributor work</h2><p>Deliverables, approval, and payout status</p></div><button className="filter-button" aria-label="Search payouts" onClick={() => setNotice('Search is coming soon.')}><Icon name="search" size={17}/></button></div>
            {records.length === 0 ? <div className="empty-state"><div className="empty-icon"><Icon name="file" size={23}/></div><h3>No bounty payouts yet</h3><p>Start with a contributor’s public pull request. Tender checks merge status before you review and pay.</p><button className="secondary-button" onClick={() => setDialogOpen(true)}><Icon name="plus" size={16}/> Add the first bounty</button></div> : <div className="milestone-list">{records.map((item) => <button key={item.id} className={`milestone-row ${selectedId === item.id ? 'selected' : ''}`} onClick={() => { setSelectedId(item.id); setNotice(''); setReviewed(false); }}><span className={`row-status ${item.status === 'paid' ? 'done' : ''}`}>{item.status === 'paid' ? <Icon name="check" size={14}/> : <span/>}</span><span className="row-main"><strong>{item.milestone}</strong><span>{getWorkType(item.workType)} · {getNetwork(item.network).shortName} · {item.program}</span></span><span className="row-amount">{item.amount}</span><span className={`status-pill ${item.status === 'paid' ? 'paid' : 'needs-review'}`}>{item.status === 'paid' ? 'Paid' : 'Needs review'}</span><Icon className="row-arrow" name="arrow" size={16}/></button>)}</div>}
            <div className="panel-footer"><span>{records.length} {records.length === 1 ? 'bounty' : 'bounties'}</span><span>Team records saved in this browser</span></div>
          </div>

          <section className="detail-panel">
            {selected ? <>
              <div className="detail-head"><div><p className="eyebrow">PAYOUT DETAILS</p><h2>{selected.milestone}</h2><p>{selected.program} · {getWorkType(selected.workType)}</p></div><span className={`status-pill ${selected.status === 'paid' ? 'paid' : 'needs-review'}`}>{selected.status === 'paid' ? 'Paid' : 'Needs review'}</span></div>
              <div className="detail-amount"><span>Work payout</span><strong>{selected.amount}</strong><small>{selectedNetwork.name} token · {shortAddress(selected.token)}</small></div>
              <div className="detail-section"><div className="section-title"><h3>Recipient</h3><button className="copy-text" onClick={() => navigator.clipboard?.writeText(selected.recipient).then(() => setNotice('Recipient address copied.'))}>Copy address</button></div><a className="address-card" href={`${selectedNetwork.explorer}/address/${selected.recipient}`} target="_blank" rel="noreferrer"><span className="address-avatar">{selected.recipient.slice(2, 4).toUpperCase()}</span><span><strong>{shortAddress(selected.recipient)}</strong><small>View wallet on {selectedNetwork.shortName} <Icon name="external" size={12}/></small></span><Icon name="external" size={15}/></a></div>
              <div className="detail-section"><div className="section-title"><h3>Work evidence</h3><span className={`evidence-state ${currentEvidence?.checked ? 'confirmed' : ''}`}><span/> {currentEvidence?.kind === 'github_pr' ? (currentEvidence.merged ? 'Merged pull request' : 'Not merged') : currentEvidence?.checked ? 'Link ready' : 'Not reviewed'}</span></div><a className="evidence-card" href={getEvidenceUrl(selected)} target="_blank" rel="noreferrer"><span className="github-mark">{parsePrUrl(getEvidenceUrl(selected)) ? 'GH' : '↗'}</span><span className="evidence-copy"><strong>{currentEvidence?.title || (parsePrUrl(getEvidenceUrl(selected)) ? parsePrUrl(getEvidenceUrl(selected)).repo : 'Supporting evidence')}</strong><small>{getEvidenceUrl(selected).replace('https://', '')}</small></span><Icon name="external" size={15}/></a><button className="check-pr-button" disabled={busy === `evidence-${selected.id}`} onClick={() => checkEvidence(selected)}><Icon name="search" size={15}/>{busy === `evidence-${selected.id}` ? 'Checking GitHub…' : 'Review evidence link'}</button>{currentEvidence?.kind === 'github_pr' && currentEvidence.merged && <div className="pr-meta"><span><Icon name="check" size={14}/> Merged {displayDate(currentEvidence.mergedAt)}</span>{currentEvidence.author && <span>by @{currentEvidence.author}</span>}</div>}</div>
              {selected.status === 'paid' ? <div className="paid-card"><div className="paid-heading"><span className="paid-check"><Icon name="check" size={17}/></span><div><strong>Payment confirmed</strong><small>{displayDate(selected.paidAt)} · {selectedNetwork.name}</small></div></div><a className="tx-link" href={`${selectedNetwork.explorer}/tx/${selected.txHash}`} target="_blank" rel="noreferrer">{shortAddress(selected.txHash)} <Icon name="external" size={14}/></a><div className="receipt-actions"><button className="secondary-button" onClick={() => shareReceipt(selected)}>Share recipient receipt</button><button className="icon-action" title="Download payout record" onClick={() => downloadReceipt(selected)}><Icon name="file" size={17}/></button></div></div> : <div className="approval-box"><div className="approval-title"><span className="step-index">1</span><div><strong>Review and release</strong><small>Confirm the work before sending funds.</small></div></div>{currentEvidence?.checked && (currentEvidence.kind !== 'github_pr' || currentEvidence.merged) ? <label className="review-check"><input type="checkbox" checked={reviewed} onChange={(event) => setReviewed(event.target.checked)}/><span>I reviewed the linked work and approve this payout.</span></label> : <p className="review-hint">Review the evidence link first. GitHub pull requests must be merged.</p>}<button className="pay-button" disabled={!currentEvidence?.checked || (currentEvidence.kind === 'github_pr' && !currentEvidence.merged) || !reviewed || Boolean(busy)} onClick={() => payMilestone(selected)}>{busy === `pay-${selected.id}` ? 'Waiting for transaction…' : <><Icon name="wallet" size={16}/> Pay {selected.amount} on {selectedNetwork.shortName}</>}</button><p className="pay-footnote">Your connected wallet will confirm the token transfer on {selectedNetwork.name}.</p></div>}
              <div className="record-meta"><span>Created {displayDate(selected.createdAt)}</span><span>Chain ID {selectedNetwork.id}</span></div>
            </> : <div className="detail-empty"><div className="detail-empty-icon"><Icon name="arrow" size={21}/></div><h3>Select a payout</h3><p>Choose a work item to review its evidence and payment details.</p></div>}
          </section>
        </section>
        </>}
        {notice && <div className="notice" role="status"><span>{notice}</span><button aria-label="Dismiss notification" onClick={() => setNotice('')}><Icon name="close" size={15}/></button></div>}
        <footer className="page-footer"><span>Tender</span><span>Merged work, payout, and reusable proof in one record.</span><a href={selectedNetwork.explorer} target="_blank" rel="noreferrer">{selectedNetwork.explorerName} <Icon name="external" size={12}/></a></footer>
      </div>
    </main>

    {dialogOpen && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setDialogOpen(false); }}>
      <section className="modal" role="dialog" aria-modal="true" aria-labelledby="new-milestone-title">
        <div className="modal-heading"><div><p className="eyebrow">NEW BOUNTY PAYOUT</p><h2 id="new-milestone-title">Pay for merged work</h2><p>Link a public GitHub PR. Tender checks the merge before enabling review and payment.</p></div><button className="icon-action" onClick={() => setDialogOpen(false)} aria-label="Close"><Icon name="close"/></button></div>
        <form onSubmit={createRecord}>
          <div className="form-grid">
            <label className="field full"><span>Paying team or repository owner</span><input value={form.program} onChange={(e) => setForm({ ...form, program: e.target.value })} placeholder="e.g. Acme Protocol" autoFocus/></label>
            <label className="field full"><span>What did the contributor build?</span><input value={form.milestone} onChange={(e) => setForm({ ...form, milestone: e.target.value })} placeholder="e.g. Add wallet connection support"/></label>
            <label className="field full"><span>Public merged pull request</span><input value={form.evidenceUrl} onChange={(e) => setForm({ ...form, evidenceUrl: e.target.value })} placeholder="https://github.com/org/repo/pull/123" spellCheck="false"/><small>Only public GitHub pull requests are supported in this first version.</small></label>
            <label className="field full"><span>Payment network</span><select value={form.network} onChange={(e) => setForm({ ...form, network: e.target.value })}><option value="tempo">Tempo Moderato</option><option value="robinhood">Robinhood Chain Testnet</option></select><small>{form.network === 'robinhood' ? <>Test ETH is required for gas. Get it from the <a className="inline-link" href={NETWORKS.robinhood.faucet} target="_blank" rel="noreferrer">Robinhood testnet faucet <Icon name="external" size={11}/></a>.</> : 'Tempo Moderato testnet payment.'}</small></label>
            <label className="field full"><span>Contributor wallet</span><input value={form.recipient} onChange={(e) => setForm({ ...form, recipient: e.target.value })} placeholder="Ask the contributor for their payout address" spellCheck="false"/><small>Confirm this address with the contributor. GitHub usernames do not prove wallet ownership.</small></label>
            <label className="field"><span>Payment amount</span><input value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="1000" inputMode="decimal"/></label>
            <label className="field"><span>Token decimals</span><input value={form.decimals} onChange={(e) => setForm({ ...form, decimals: e.target.value })} placeholder="6" inputMode="numeric"/></label>
            <label className="field full"><span>Token contract</span><input value={form.token} onChange={(e) => setForm({ ...form, token: e.target.value })} placeholder="0x…" spellCheck="false"/><small>Enter a token contract deployed on {getNetwork(form.network).name} and its decimal precision.</small></label>
          </div>
          {formError && <p className="form-error">{formError}</p>}
          <div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setDialogOpen(false)}>Cancel</button><button type="submit" className="primary-button">Create bounty payout <Icon name="arrow" size={16}/></button></div>
        </form>
      </section>
    </div>}
  </div>;
}

export default App;
