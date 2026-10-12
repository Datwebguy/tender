import { useEffect, useMemo, useState } from 'react';
import { NETWORKS, getNetwork, getWorkType } from './lib/networks.js';
import { shortAddress, displayDate, isWebUrl, safeUrl, parsePrUrl, prKey, getEvidenceUrl, isAddress, isTxHash, safeJsonArray } from './lib/format.js';
import { encodeShare, decodeShare, isCheckableRecord } from './lib/share.js';
import { requestSignature, checkSignature } from './lib/api.js';
import { toTokenUnits, transferCalldata, matchesTokenTransfer, getNetworkReceipt, getTokenMetadata, simulateTokenTransfer, waitForNetworkReceipt, switchWalletNetwork } from './lib/chain.js';

const STORAGE_KEY = 'tender.closeouts.v1';
const CONTRIBUTOR_KEY = 'tender.contributor-record.v1';
const EMPTY_FORM = { program: '', workType: 'bounty', milestone: '', recipient: '', amount: '', token: '', tokenSymbol: '', decimals: '6', evidenceUrl: '', network: 'tempo' };

function readStored(key) {
  try { return safeJsonArray(localStorage.getItem(key)); }
  catch { return []; }
}
function writeStored(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); }
  catch { /* Storage can be full or blocked; the in-memory list still works for this session. */ }
}
const readRecords = () => readStored(STORAGE_KEY);
const readContributorReceipts = () => readStored(CONTRIBUTOR_KEY);
function getProvider() { return window.ethereum; }


function Icon({ name, size = 18, className }) {
  const shared = { className, width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true };
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
  const checkable = isCheckableRecord(record);
  const [verification, setVerification] = useState(!record?.txHash ? 'none' : checkable ? 'checking' : 'failed');
  const [saved, setSaved] = useState(() => Boolean(record?.txHash && readContributorReceipts().some((item) => item.txHash === record.txHash)));
  const [recipientWalletCheck, setRecipientWalletCheck] = useState('idle');
  const [signature, setSignature] = useState(record?.signature ? 'checking' : 'none');
  useEffect(() => {
    if (!record?.txHash || !checkable) return undefined;
    let active = true;
    getNetworkReceipt(record.txHash, record.network || 'tempo')
      .then((receipt) => { if (active) setVerification(matchesTokenTransfer(receipt, record) ? 'confirmed' : receipt ? 'failed' : 'pending'); })
      .catch(() => { if (active) setVerification('pending'); });
    return () => { active = false; };
  }, [record?.txHash, record?.recipient, record?.amount, record?.token, record?.decimals, record?.network]);
  useEffect(() => {
    if (!record?.signature) return undefined;
    let active = true;
    checkSignature(record, record.signature)
      .then((valid) => { if (active) setSignature(valid ? 'valid' : 'invalid'); })
      .catch(() => { if (active) setSignature('unavailable'); });
    return () => { active = false; };
  }, [record?.signature, record?.program, record?.milestone, record?.amount, record?.recipient, record?.txHash, record?.paidAt, record?.payer, record?.evidenceUrl]);
  function saveToContributorRecord() {
    const savedReceipts = readContributorReceipts();
    if (!savedReceipts.some((item) => item.txHash === record.txHash)) {
      writeStored(CONTRIBUTOR_KEY, [{ ...record, savedAt: new Date().toISOString() }, ...savedReceipts]);
    }
    setSaved(true);
  }
  async function checkRecipientWallet() {
    const provider = getProvider();
    if (!provider) { setRecipientWalletCheck('unavailable'); return; }
    setRecipientWalletCheck('checking');
    try {
      const accounts = await provider.request({ method: 'eth_requestAccounts' });
      const account = accounts?.[0] || '';
      setRecipientWalletCheck(account.toLowerCase() === record.recipient?.toLowerCase() ? 'match' : 'mismatch');
    } catch { setRecipientWalletCheck('cancelled'); }
  }
  if (!record) return <main className="receipt-page"><div className="receipt-card"><Brand /><h1>Receipt not found</h1><p>This link may be incomplete. Ask the payer to send it again.</p></div></main>;
  return <main className="receipt-page">
    <div className="receipt-card">
      <Brand />
      <div className={`receipt-mark ${verification === 'confirmed' ? 'is-confirmed' : ''}`}><Icon name={verification === 'confirmed' ? 'check' : 'file'} size={24}/></div>
      <p className="eyebrow">PAYOUT RECEIPT</p>
      <h1>{record.milestone || 'Work payout'}</h1>
      <p className="receipt-program">{record.program || 'Paying team'} · {getWorkType(record.workType)}</p>
      <div className="receipt-amount">{record.amount} <span>{record.tokenSymbol || 'token'}</span></div>
      <div className="receipt-lines">
        <div><span>Recipient</span><strong>{shortAddress(record.recipient)}</strong></div>
        {record.workEvidence?.author && <div><span>GitHub contributor</span><a href={safeUrl(record.workEvidence.authorUrl) || `https://github.com/${encodeURIComponent(record.workEvidence.author)}`} target="_blank" rel="noreferrer">@{record.workEvidence.author} <Icon name="external" size={13}/></a></div>}
        <div><span>Work evidence</span>{getEvidenceUrl(record) ? <a href={getEvidenceUrl(record)} target="_blank" rel="noreferrer">Open evidence <Icon name="external" size={14}/></a> : <strong>Not attached</strong>}</div>
        <div><span>Payment date</span><strong>{displayDate(record.paidAt)}</strong></div>
        <div><span>Network</span><strong>{network.name}</strong></div>
        <div><span>Token contract</span><strong>{shortAddress(record.token)}</strong></div>
        <div><span>Tender signature</span><strong className={signature === 'valid' ? 'positive' : signature === 'invalid' ? 'negative' : ''}>{signature === 'valid' ? 'Signed by Tender — details unaltered' : signature === 'invalid' ? 'Signature invalid — details were changed' : signature === 'checking' ? 'Checking signature…' : signature === 'unavailable' ? 'Signature could not be checked' : 'Unsigned receipt'}</strong></div>
        {record.payer && <div><span>Paid by</span><strong>{shortAddress(record.payer)}</strong></div>}
        <div><span>On-chain status</span><strong className={verification === 'confirmed' ? 'positive' : ''}>{verification === 'checking' ? 'Checking token transfer…' : verification === 'confirmed' ? 'Transfer verified' : verification === 'failed' ? (checkable ? 'Transfer details do not match' : 'Receipt details are incomplete or invalid') : verification === 'pending' ? 'Not confirmed yet' : 'No transaction attached'}</strong></div>
      </div>
      <div className="recipient-wallet-check"><button className="secondary-button" onClick={checkRecipientWallet}><Icon name="wallet" size={14}/> Check my connected wallet</button><span className={recipientWalletCheck}>{recipientWalletCheck === 'match' ? 'This connected wallet matches the recipient.' : recipientWalletCheck === 'mismatch' ? 'This connected wallet is different from the recipient address.' : recipientWalletCheck === 'unavailable' ? 'No compatible wallet was found in this browser.' : recipientWalletCheck === 'cancelled' ? 'Wallet connection was cancelled.' : recipientWalletCheck === 'checking' ? 'Checking wallet address…' : 'Optional: confirm this receipt is addressed to your wallet.'}</span></div>
      {isTxHash(record.txHash) && <a className="explorer-link" href={`${network.explorer}/tx/${record.txHash}`} target="_blank" rel="noreferrer">Open transaction in {network.explorerName} <Icon name="external" size={15}/></a>}
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
  const [query, setQuery] = useState('');
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
  const [form, setForm] = useState(EMPTY_FORM);
  const [tokenLookup, setTokenLookup] = useState({ status: 'idle', message: '' });

  useEffect(() => { writeStored(STORAGE_KEY, records); }, [records]);
  useEffect(() => { writeStored(CONTRIBUTOR_KEY, contributorReceipts); }, [contributorReceipts]);
  useEffect(() => {
    const provider = getProvider();
    if (!provider?.on) return undefined;
    const onAccounts = (accounts) => setWallet(accounts?.[0] || '');
    provider.on('accountsChanged', onAccounts);
    return () => provider.removeListener?.('accountsChanged', onAccounts);
  }, []);
  useEffect(() => {
    if (!isAddress(form.token)) { setTokenLookup({ status: 'idle', message: '' }); return undefined; }
    let active = true;
    const timer = window.setTimeout(async () => {
      if (active) setTokenLookup({ status: 'checking', message: 'Reading token details from the selected network…' });
      try {
        const metadata = await getTokenMetadata(form.network, form.token);
        if (!active) return;
        setForm((current) => current.token.toLowerCase() === form.token.toLowerCase() && current.network === form.network
          ? { ...current, tokenSymbol: metadata.symbol, decimals: String(metadata.decimals) } : current);
        setTokenLookup({ status: 'ready', message: `${metadata.symbol || 'Token'} · ${metadata.decimals} decimals` });
      } catch (error) {
        if (active) setTokenLookup({ status: 'error', message: error.message || 'Could not read token details. Check the address and network.' });
      }
    }, 450);
    return () => { active = false; window.clearTimeout(timer); };
  }, [form.token, form.network]);
  useEffect(() => {
    let active = true;
    contributorReceipts.forEach((item) => {
      if (!isCheckableRecord(item)) { setReceiptChecks((current) => ({ ...current, [item.txHash]: 'unverified' })); return; }
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
  const visibleRecords = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return needle ? records.filter((item) => [item.milestone, item.program, item.recipient, item.evidenceUrl, item.tokenSymbol].some((value) => String(value || '').toLowerCase().includes(needle))) : records;
  }, [records, query]);
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
      const response = await fetch(`https://api.github.com/repos/${parsed.owner}/${parsed.repo}/pulls/${parsed.number}`, { headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' } });
      if (!response.ok) throw new Error(response.status === 404 ? 'Pull request not found. Check that the repository is public and the URL is correct.' : response.status === 403 || response.status === 429 ? 'GitHub rate limit reached. Try again in a few minutes.' : `GitHub returned ${response.status}.`);
      const pr = await response.json();
      setPrDetails((current) => ({ ...current, [record.id]: { kind: 'github_pr', checked: true, title: pr.title, merged: Boolean(pr.merged), mergedAt: pr.merged_at, author: pr.user?.login, authorUrl: pr.user?.html_url, url: pr.html_url, base: pr.base?.repo?.full_name, head: pr.head?.ref, baseBranch: pr.base?.ref, additions: pr.additions, deletions: pr.deletions, changedFiles: pr.changed_files } }));
      setNotice(pr.merged ? 'GitHub confirms this pull request was merged. Review the work before approving payment.' : 'This pull request is not merged yet. Tender will not enable payment.');
    } catch (error) { setNotice(error.message || 'Could not check the pull request.'); }
    finally { setBusy(''); }
  }

  async function finalizePayment(record, txHash, evidence) {
    const network = getNetwork(record.network);
    try {
      const receipt = await waitForNetworkReceipt(txHash, record.network || 'tempo');
      if (!matchesTokenTransfer(receipt, record)) {
        const reverted = receipt.status !== '0x1';
        setRecords((current) => current.map((item) => item.id === record.id ? { ...item, status: 'review', txHash: undefined, submittedAt: undefined } : item));
        throw new Error(reverted ? `The transaction was reverted on ${network.shortName}, so no funds moved. You can try again. ${txHash}` : `The confirmed transaction did not emit the expected token, recipient, and amount. Check it in the explorer: ${txHash}`);
      }
      const paidAt = new Date().toISOString();
      setRecords((current) => current.map((item) => item.id === record.id ? { ...item, status: 'paid', txHash, paidAt, reviewedAt: item.reviewedAt || paidAt, workEvidence: evidence || item.workEvidence } : item));
      setReviewed(false); setNotice(`Payment confirmed on ${network.shortName}. Signing the receipt…`);
      await signPaidRecord({ ...record, status: 'paid', txHash, paidAt }, true);
    } catch (error) { setNotice(error.message || 'Payment could not be confirmed.'); }
  }

  async function signPaidRecord(record, afterPayment = false) {
    try {
      const signed = await requestSignature(record);
      setRecords((current) => current.map((item) => item.id === record.id ? { ...item, signature: signed.signature, payer: signed.record.payer, paidAt: signed.record.paidAt } : item));
      setNotice(afterPayment ? 'Payment confirmed and the receipt is signed. It is ready to share.' : 'Receipt signed. Share links now carry the signature.');
    } catch (error) {
      setNotice(afterPayment ? `Payment confirmed, but the receipt could not be signed: ${error.message} Use “Sign receipt” to retry.` : error.message);
    }
  }

  async function recheckSubmitted(record) {
    setBusy(`pay-${record.id}`); setNotice(`Checking ${getNetwork(record.network).shortName} for confirmation…`);
    try { await finalizePayment(record, record.txHash, record.workEvidence); }
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
    const duplicate = records.find((item) => prKey(item.evidenceUrl) === prKey(form.evidenceUrl) && item.recipient?.toLowerCase() === form.recipient.toLowerCase());
    if (duplicate) return setFormError(`A payout to this wallet for this pull request already exists (“${duplicate.milestone}”). Open it instead of paying twice.`);
    const record = { id: crypto.randomUUID(), ...form, program: form.program.trim(), milestone: form.milestone.trim(), evidenceUrl: form.evidenceUrl.trim(), decimals, status: 'review', createdAt: new Date().toISOString() };
    setRecords((current) => [record, ...current]); setSelectedId(record.id); setDialogOpen(false); setReviewed(false); setPrDetails({});
    setForm(EMPTY_FORM);
    setNotice('Bounty payout created. Check the merged PR, review the work, then pay the contributor.');
  }

  async function payMilestone(record) {
    const provider = getProvider();
    const network = getNetwork(record.network);
    if (!provider) { setNotice('Install an EVM wallet such as MetaMask to make a testnet payment.'); return; }
    if (record.status !== 'review') { setNotice('This payout has already been sent.'); return; }
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
      const transaction = { from: account, to: record.token, data, value: '0x0' };
      setNotice('Checking token balance and transfer rules…');
      await simulateTokenTransfer(provider, transaction);
      const txHash = await provider.request({ method: 'eth_sendTransaction', params: [transaction] });
      // Persist the hash right away: if the tab closes before confirmation, the payment is still tracked and can be rechecked.
      const submitted = { ...record, status: 'submitted', txHash, reviewer: account, reviewedAt: new Date().toISOString(), submittedAt: new Date().toISOString(), workEvidence: detail };
      setRecords((current) => current.map((item) => item.id === record.id ? submitted : item));
      setNotice(`Transaction submitted. Waiting for ${network.shortName} confirmation…`);
      await finalizePayment(submitted, txHash, detail);
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
    const payload = { product: 'Tender', version: 1, organization: record.program, workType: record.workType || 'bounty', deliverable: record.milestone, recipient: record.recipient, amount: record.amount, token: record.token, tokenSymbol: record.tokenSymbol || null, tokenDecimals: record.decimals, evidenceUrl: getEvidenceUrl(record), workEvidence: evidence, reviewer: record.reviewer || null, reviewedAt: record.reviewedAt || null, txHash: record.txHash || null, paidAt: record.paidAt || null, network: network.name, chainId: network.id, recordCreatedAt: record.createdAt };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const anchor = document.createElement('a'); anchor.href = URL.createObjectURL(blob); anchor.download = `tender-${String(record.milestone || 'work').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60)}-payout.json`; document.body.appendChild(anchor); anchor.click(); anchor.remove(); window.setTimeout(() => URL.revokeObjectURL(anchor.href), 1000);
  }

  const currentEvidence = selected ? (prDetails[selected.id] || (selected.status !== 'review' ? selected.workEvidence : null)) : null;
  return <div className="app-shell">
    <aside className="sidebar">
      <Brand />
      <div className="workspace-switch"><div className="workspace-avatar">{records[0]?.program?.[0]?.toUpperCase() || 'T'}</div><div><strong>{records[0]?.program || 'Tender'}</strong><span>Open-source payouts</span></div></div>
      <p className="nav-label">WORKSPACE</p>
      <button className={`nav-item ${view === 'team' ? 'active' : ''}`} onClick={() => setView('team')}><span className="nav-icon"><Icon name="file"/></span>Bounty payouts<span className="nav-count">{records.length}</span></button>
      <button className={`nav-item ${view === 'contributor' ? 'active' : ''}`} onClick={() => setView('contributor')}><span className="nav-icon"><Icon name="wallet"/></span>My work record<span className="nav-count">{contributorReceipts.length}</span></button>
      <div className="sidebar-bottom"><div className="network-indicator"><span className="network-dot"/><div><strong>{selectedNetwork.name}</strong><span>Test network</span></div></div><div className="profile-row"><div className="profile-avatar">{wallet ? wallet.slice(2, 4).toUpperCase() : 'DW'}</div><div className="profile-copy"><strong>{wallet ? shortAddress(wallet) : 'Payer wallet'}</strong><span>{wallet ? 'Wallet connected' : 'Connect wallet to pay'}</span></div></div></div>
    </aside>

    <main className="main-area">
      <header className="topbar"><div className="breadcrumb"><span>Tender</span><span className="crumb-slash">/</span><strong>{view === 'team' ? 'Bounty payouts' : 'My work record'}</strong></div><div className="topbar-actions"><span className="top-network"><span className="network-dot"/>{selectedNetwork.shortName}</span>{view === 'team' && <button className={`wallet-button ${wallet ? 'connected' : ''}`} onClick={connectWallet}><Icon name="wallet" size={16}/>{wallet ? shortAddress(wallet) : 'Connect payer wallet'}</button>}</div></header>
      <div className="content-wrap">
        {view === 'contributor' ? <>
          <div className="page-heading"><div><p className="eyebrow">YOUR OPEN-SOURCE WORK HISTORY</p><h1>My work record</h1><p className="page-subtitle">Receipts for completed work, rechecked against each payout network.</p></div><span className="record-count">{contributorReceipts.length} {contributorReceipts.length === 1 ? 'saved receipt' : 'saved receipts'}</span></div>
          <div className="record-intro"><div className="record-intro-mark"><Icon name="check" size={19}/></div><div><strong>Keep proof of paid work with you</strong><p>Open a Tender receipt and save it after its token, recipient, and amount match the on-chain transfer. This record stays in this browser; each receipt link remains shareable.</p></div></div>
          {contributorReceipts.length ? <div className="contributor-receipts">{contributorReceipts.map((item) => <article className="contributor-receipt" key={item.txHash}><div className="contributor-receipt-top"><span className={`verified-badge ${receiptChecks[item.txHash] === 'verified' ? '' : 'badge-pending'}`}><Icon name={receiptChecks[item.txHash] === 'verified' ? 'check' : 'clock'} size={13}/> {receiptChecks[item.txHash] === 'verified' ? 'On-chain verified' : receiptChecks[item.txHash] === 'unverified' ? 'Transfer not matched' : receiptChecks[item.txHash] === 'unavailable' ? 'Network unavailable' : 'Checking transfer'}</span><span>{displayDate(item.paidAt)}</span></div><h2>{item.milestone || item.workEvidence?.title || 'Open-source contribution'}</h2><p>{item.program || 'Paying team'} · {item.workEvidence?.author ? `@${item.workEvidence.author} · ` : ''}{getWorkType(item.workType)} · {getNetwork(item.network).name}</p><div className="contributor-receipt-bottom"><strong>{item.amount} {item.tokenSymbol || 'token'}</strong><a href={`${getNetwork(item.network).explorer}/tx/${item.txHash}`} target="_blank" rel="noreferrer">View transfer <Icon name="external" size={13}/></a></div><div className="contribution-actions">{getEvidenceUrl(item) && <a className="contribution-evidence" href={getEvidenceUrl(item)} target="_blank" rel="noreferrer">View merged contribution <Icon name="external" size={13}/></a>}<button onClick={() => shareReceipt(item)}>Share receipt</button></div></article>)}</div> : <div className="empty-state record-empty"><div className="empty-icon"><Icon name="file" size={23}/></div><h3>Your work record starts with a paid contribution</h3><p>When a team sends you a Tender receipt, open it and save the verified payout here.</p></div>}
        </> : <>
        <div className="page-heading"><div><p className="eyebrow">OPEN-SOURCE CONTRIBUTOR PAYOUTS</p><h1>Pay for merged work</h1><p className="page-subtitle">Review a contributor’s merged PR, send the bounty, and give them a receipt they can keep.</p></div><button className="primary-button" onClick={() => { setFormError(''); setDialogOpen(true); }}><Icon name="plus" size={17}/> New bounty payout</button></div>
        <section className="stats-grid" aria-label="Bounty payout summary">
          <div className="stat-card"><div className="stat-top"><span>Awaiting approval</span><span className="stat-icon amber"><Icon name="clock" size={17}/></span></div><strong>{pendingCount}</strong><span className="stat-foot">Work items in review</span></div>
          <div className="stat-card"><div className="stat-top"><span>Payments confirmed</span><span className="stat-icon green"><Icon name="check" size={17}/></span></div><strong>{paidCount}</strong><span className="stat-foot">Across supported networks</span></div>
          <div className="stat-card"><div className="stat-top"><span>Networks used</span><span className="stat-icon blue"><Icon name="arrow" size={17}/></span></div><strong>{networksUsed}</strong><span className="stat-foot">Testnet payout records</span></div>
        </section>
        <section className="workspace-grid">
          <div className="list-panel">
            <div className="panel-heading"><div><h2>Contributor work</h2><p>Deliverables, approval, and payout status</p></div><label className="list-search"><Icon name="search" size={16}/><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search payouts" aria-label="Search payouts"/></label></div>
            {records.length > 0 && visibleRecords.length === 0 ? <div className="empty-state"><h3>No matching payouts</h3><p>Nothing matches “{query}”.</p><button className="secondary-button" onClick={() => setQuery('')}>Clear search</button></div> : records.length === 0 ? <div className="empty-state"><div className="empty-icon"><Icon name="file" size={23}/></div><h3>No bounty payouts yet</h3><p>Start with a contributor’s public pull request. Tender checks merge status before you review and pay.</p><button className="secondary-button" onClick={() => setDialogOpen(true)}><Icon name="plus" size={16}/> Add the first bounty</button></div> : <div className="milestone-list">{visibleRecords.map((item) => <button key={item.id} className={`milestone-row ${selectedId === item.id ? 'selected' : ''}`} onClick={() => { setSelectedId(item.id); setNotice(''); setReviewed(false); }}><span className={`row-status ${item.status === 'paid' ? 'done' : ''}`}>{item.status === 'paid' ? <Icon name="check" size={14}/> : <span/>}</span><span className="row-main"><strong>{item.milestone}</strong><span>{getWorkType(item.workType)} · {getNetwork(item.network).shortName} · {item.program}</span></span><span className="row-amount">{item.amount}</span><span className={`status-pill ${item.status === 'paid' ? 'paid' : 'needs-review'}`}>{item.status === 'paid' ? 'Paid' : item.status === 'submitted' ? 'Confirming' : 'Needs review'}</span><Icon className="row-arrow" name="arrow" size={16}/></button>)}</div>}
            <div className="panel-footer"><span>{records.length} {records.length === 1 ? 'bounty' : 'bounties'}</span><span>Team records saved in this browser</span></div>
          </div>

          <section className="detail-panel">
            {selected ? <>
              <div className="detail-head"><div><p className="eyebrow">PAYOUT DETAILS</p><h2>{selected.milestone}</h2><p>{selected.program} · {getWorkType(selected.workType)}</p></div><span className={`status-pill ${selected.status === 'paid' ? 'paid' : 'needs-review'}`}>{selected.status === 'paid' ? 'Paid' : selected.status === 'submitted' ? 'Confirming' : 'Needs review'}</span></div>
              <div className="detail-amount"><span>Work payout</span><strong>{selected.amount} {selected.tokenSymbol || ''}</strong><small>{selectedNetwork.name} · {shortAddress(selected.token)}</small></div>
              <div className="detail-section"><div className="section-title"><h3>Recipient</h3><button className="copy-text" onClick={() => navigator.clipboard?.writeText(selected.recipient).then(() => setNotice('Recipient address copied.'), () => setNotice(selected.recipient))}>Copy address</button></div><a className="address-card" href={`${selectedNetwork.explorer}/address/${selected.recipient}`} target="_blank" rel="noreferrer"><span className="address-avatar">{selected.recipient.slice(2, 4).toUpperCase()}</span><span><strong>{shortAddress(selected.recipient)}</strong><small>View wallet on {selectedNetwork.shortName} <Icon name="external" size={12}/></small></span><Icon name="external" size={15}/></a></div>
              <div className="detail-section"><div className="section-title"><h3>Work evidence</h3><span className={`evidence-state ${currentEvidence?.checked ? 'confirmed' : ''}`}><span/> {currentEvidence?.kind === 'github_pr' ? (currentEvidence.merged ? 'Merged pull request' : 'Not merged') : currentEvidence?.checked ? 'Link ready' : 'Not reviewed'}</span></div><a className="evidence-card" href={getEvidenceUrl(selected)} target="_blank" rel="noreferrer"><span className="github-mark">{parsePrUrl(getEvidenceUrl(selected)) ? 'GH' : '↗'}</span><span className="evidence-copy"><strong>{currentEvidence?.title || (parsePrUrl(getEvidenceUrl(selected)) ? parsePrUrl(getEvidenceUrl(selected)).repo : 'Supporting evidence')}</strong><small>{getEvidenceUrl(selected).replace('https://', '')}</small></span><Icon name="external" size={15}/></a><button className="check-pr-button" disabled={busy === `evidence-${selected.id}`} onClick={() => checkEvidence(selected)}><Icon name="search" size={15}/>{busy === `evidence-${selected.id}` ? 'Checking GitHub…' : 'Review evidence link'}</button>{currentEvidence?.kind === 'github_pr' && currentEvidence.merged && <div className="pr-meta"><span><Icon name="check" size={14}/> Merged {displayDate(currentEvidence.mergedAt)}</span>{currentEvidence.author && <a href={safeUrl(currentEvidence.authorUrl) || `https://github.com/${encodeURIComponent(currentEvidence.author)}`} target="_blank" rel="noreferrer">by @{currentEvidence.author} <Icon name="external" size={12}/></a>}<span>{currentEvidence.changedFiles ?? '—'} files · +{currentEvidence.additions ?? '—'} / −{currentEvidence.deletions ?? '—'}</span></div>}</div>
              {selected.status === 'paid' ? <div className="paid-card"><div className="paid-heading"><span className="paid-check"><Icon name="check" size={17}/></span><div><strong>Payment confirmed</strong><small>{displayDate(selected.paidAt)} · {selectedNetwork.name}</small></div></div>{isTxHash(selected.txHash) && <a className="tx-link" href={`${selectedNetwork.explorer}/tx/${selected.txHash}`} target="_blank" rel="noreferrer">{shortAddress(selected.txHash)} <Icon name="external" size={14}/></a>}{selected.signature ? <p className="signed-note"><Icon name="check" size={13}/> Signed by Tender</p> : <button className="secondary-button sign-button" disabled={Boolean(busy)} onClick={async () => { setBusy(`sign-${selected.id}`); await signPaidRecord(selected); setBusy(''); }}>{busy === `sign-${selected.id}` ? 'Signing…' : 'Sign receipt'}</button>}<div className="receipt-actions"><button className="secondary-button" onClick={() => shareReceipt(selected)}>Share recipient receipt</button><button className="icon-action" title="Download payout record" onClick={() => downloadReceipt(selected)}><Icon name="file" size={17}/></button></div></div> : selected.status === 'submitted' ? <div className="approval-box"><div className="approval-title"><span className="step-index"><Icon name="clock" size={14}/></span><div><strong>Waiting for confirmation</strong><small>The transfer was sent from your wallet. Funds may already have moved, so do not pay again.</small></div></div>{isTxHash(selected.txHash) && <a className="tx-link" href={`${selectedNetwork.explorer}/tx/${selected.txHash}`} target="_blank" rel="noreferrer">{shortAddress(selected.txHash)} <Icon name="external" size={14}/></a>}<button className="pay-button" disabled={Boolean(busy)} onClick={() => recheckSubmitted(selected)}>{busy === `pay-${selected.id}` ? 'Checking network…' : 'Check confirmation'}</button></div> : <div className="approval-box"><div className="approval-title"><span className="step-index">1</span><div><strong>Review and release</strong><small>Confirm the work before sending funds.</small></div></div>{currentEvidence?.checked && (currentEvidence.kind !== 'github_pr' || currentEvidence.merged) ? <label className="review-check"><input type="checkbox" checked={reviewed} onChange={(event) => setReviewed(event.target.checked)}/><span>I reviewed the merged change{currentEvidence.author ? ` by @${currentEvidence.author}` : ''} and confirmed this payout address with the contributor.</span></label> : <p className="review-hint">Review the evidence link first. GitHub pull requests must be merged.</p>}<button className="pay-button" disabled={!currentEvidence?.checked || (currentEvidence.kind === 'github_pr' && !currentEvidence.merged) || !reviewed || Boolean(busy)} onClick={() => payMilestone(selected)}>{busy === `pay-${selected.id}` ? 'Checking and sending…' : <><Icon name="wallet" size={16}/> Pay {selected.amount} {selected.tokenSymbol || ''} on {selectedNetwork.shortName}</>}</button><p className="pay-footnote">Tender simulates the token transfer first. Your wallet signs only after the preflight succeeds.</p></div>}
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
            <label className="field full"><span>Payment network</span><select value={form.network} onChange={(e) => setForm({ ...form, network: e.target.value })}><option value="tempo">Tempo Moderato</option><option value="robinhood">Robinhood Chain Testnet</option></select><small>{form.network === 'robinhood' ? <>Test ETH is required for gas. Get it from the <a className="inline-link" href={NETWORKS.robinhood.faucet} target="_blank" rel="noreferrer">Robinhood testnet faucet <Icon name="external" size={11}/></a>.</> : <>Get test stablecoins from the <a className="inline-link" href={NETWORKS.tempo.faucet} target="_blank" rel="noreferrer">Tempo faucet <Icon name="external" size={11}/></a>.</>}</small></label>
            <label className="field full"><span>Contributor wallet</span><input value={form.recipient} onChange={(e) => setForm({ ...form, recipient: e.target.value })} placeholder="Ask the contributor for their payout address" spellCheck="false"/><small>Confirm this address with the contributor. GitHub usernames do not prove wallet ownership.</small></label>
            <label className="field"><span>Payment amount</span><input value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="1000" inputMode="decimal"/></label>
            <label className="field"><span>Token decimals</span><input value={form.decimals} onChange={(e) => setForm({ ...form, decimals: e.target.value })} placeholder="Read from token" inputMode="numeric" readOnly={tokenLookup.status === 'ready'}/></label>
            <label className="field full"><span>Token contract</span><input value={form.token} onChange={(e) => setForm({ ...form, token: e.target.value, tokenSymbol: '', decimals: '6' })} placeholder="0x…" spellCheck="false"/><small className={`token-lookup ${tokenLookup.status}`}>{tokenLookup.message || `Token symbol and decimals are read from ${getNetwork(form.network).shortName} when available.`}</small></label>
          </div>
          {formError && <p className="form-error">{formError}</p>}
          <div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setDialogOpen(false)}>Cancel</button><button type="submit" className="primary-button">Create bounty payout <Icon name="arrow" size={16}/></button></div>
        </form>
      </section>
    </div>}
  </div>;
}

export default App;
