import { useEffect, useMemo, useState } from 'react';
import { useAppKit } from '@reown/appkit/react';
import { useAccount, useConnect, useDisconnect, useSwitchChain, useWalletClient } from 'wagmi';
import { PATH_USD, readEscrowOrder, reserveProtectedPayment, settleProtectedPayment } from './tempo';
import { TEMPO_MODERATO } from './reown';
import Brand from './Brand';
import DesignStudio from './DesignStudio';
import { Home, WalletPanel } from './Experience';

const configuredTokenAddress = import.meta.env.VITE_TEMPO_TOKEN_ADDRESS || PATH_USD;
const configuredTokenSymbol = import.meta.env.VITE_TEMPO_TOKEN_SYMBOL || '';
const paymentTokenSymbol = configuredTokenSymbol || 'pathUSD';
const tokenConfigError = (configuredTokenAddress.toLowerCase() === PATH_USD.toLowerCase() && configuredTokenSymbol && configuredTokenSymbol !== 'pathUSD')
  || (configuredTokenAddress.toLowerCase() !== PATH_USD.toLowerCase() && !configuredTokenSymbol)
  ? 'Configure a matching token address and symbol. Only six-decimal TIP-20 tokens are supported.'
  : '';
const ORDER_STORAGE_KEY = 'tender.orders.v4';
const statusMeta = {
  pending: { label: 'Awaiting payment', className: 'reserved' },
  reserved: { label: 'Payment reserved', className: 'reserved' },
  fulfilled: { label: 'Ready to capture', className: 'fulfilled' },
  captured: { label: 'Captured', className: 'captured' },
  refunded: { label: 'Refunded', className: 'refunded' },
  unknown: { label: 'Unknown status', className: 'expired' },
};

async function apiRequest(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: { 'content-type': 'application/json', ...options.headers },
  });
  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error(`Tender API returned an unreadable response (${response.status}).`);
  }
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status}).`);
  return data;
}

function readCachedOrders() {
  try {
    const value = localStorage.getItem(ORDER_STORAGE_KEY);
    if (!value) return { orders: [], error: '' };
    const orders = JSON.parse(value);
    if (!Array.isArray(orders)) throw new Error('Saved order data is not a list.');
    return { orders, error: '' };
  } catch (error) {
    return { orders: [], error: error.message || 'Saved orders could not be read.' };
  }
}

function checkoutLink(orderId) {
  return `${window.location.origin}/#/checkout?order=${encodeURIComponent(orderId)}`;
}

function money(value) {
  return new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value));
}

function displayDate(value) {
  if (!value) return 'Not recorded';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Not recorded' : date.toLocaleString();
}

function shortAddress(value) {
  return value ? `${value.slice(0, 6)}…${value.slice(-4)}` : 'Not recorded';
}

function Icon({ name }) {
  const paths = {
    arrow: <><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    download: <><path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M5 20h14" /></>,
    close: <><path d="m6 6 12 12" /><path d="m18 6-12 12" /></>,
    lock: <><rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></>,
    wallet: <><path d="M4 7h16v12H4z" /><path d="M4 7V5h13" /><path d="M16 14h.01" /></>,
    box: <><path d="m4 7 8-4 8 4-8 4z" /><path d="M4 7v10l8 4 8-4V7" /><path d="M12 11v10" /></>,
    refund: <><path d="M4 7v5h5" /><path d="M5 12a7 7 0 1 0 2-5" /></>,
  };
  return <svg viewBox="0 0 24 24" aria-hidden="true">{paths[name]}</svg>;
}



function StatusPill({ status }) {
  const meta = statusMeta[status] || statusMeta.unknown;
  return <span className={`status-pill ${meta.className}`}><span className="status-dot" />{meta.label}</span>;
}

function ProductArt({ product }) {
  return <div className="product-art">
    {product.imageUrl ? <img src={product.imageUrl} alt="" /> : <span>{product.name.split(/\s+/).map((word) => word[0]).slice(0, 2).join('')}</span>}
  </div>;
}

function App() {
  const { open } = useAppKit();
  const { address, isConnected, chainId, connector: activeConnector } = useAccount();
  const { connectors, connectAsync } = useConnect();
  const { disconnect } = useDisconnect();
  const { data: walletClient } = useWalletClient();
  const { switchChainAsync } = useSwitchChain();
  const initial = useMemo(readCachedOrders, []);
  const [orders, setOrders] = useState([]);
  const [ordersLoaded, setOrdersLoaded] = useState(false);
  const [storageError, setStorageError] = useState(initial.error);
  const [products, setProducts] = useState([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState('');
  const [selectedId, setSelectedId] = useState(initial.orders[0]?.id || null);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [view, setView] = useState(new URLSearchParams(window.location.hash.split('?')[1] || '').has('order') ? 'checkout' : 'home');
  const [buying, setBuying] = useState(false);
  const [settling, setSettling] = useState(false);
  const [notice, setNotice] = useState('');
  const [walletHelp, setWalletHelp] = useState(false);
  const [walletBusy, setWalletBusy] = useState(false);
  const [checkoutState, setCheckoutState] = useState('idle');
  const [copyFallback, setCopyFallback] = useState('');
  const [newOrderOpen, setNewOrderOpen] = useState(false);
  const [newOrderProductId, setNewOrderProductId] = useState('');
  const [newOrderAmount, setNewOrderAmount] = useState('');
  const [newOrderDeadline, setNewOrderDeadline] = useState('');
  const [createdOrderLink, setCreatedOrderLink] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [lastSynced, setLastSynced] = useState(null);
  const [installPrompt, setInstallPrompt] = useState(null);
  const [showInstallHelp, setShowInstallHelp] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const wallet = address ? shortAddress(address) : '';
  const onTempo = chainId === TEMPO_MODERATO.id;
  const storeName = import.meta.env.VITE_TENDER_STORE_NAME || '';
  const sharedOrderId = new URLSearchParams(window.location.hash.split('?')[1] || '').get('order');
  const selectedOrder = orders.find((order) => order.id === selectedId) || orders[0];
  const stats = useMemo(() => ({
    reserved: orders.filter((order) => ['reserved', 'fulfilled'].includes(order.status)).length,
    captured: orders.filter((order) => order.status === 'captured').length,
  }), [orders]);

  useEffect(() => {
    const standalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
    setIsInstalled(standalone);
    const onInstallPrompt = (event) => {
      // Let Android show its native install banner; retain the event for our button.
      setInstallPrompt(event);
    };
    const onInstalled = () => {
      setIsInstalled(true);
      setInstallPrompt(null);
    };
    window.addEventListener('beforeinstallprompt', onInstallPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onInstallPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  async function installApp() {
    if (!installPrompt) {
      setShowInstallHelp(true);
      return;
    }
    try {
      await installPrompt.prompt();
      await installPrompt.userChoice;
    } catch {
      setShowInstallHelp(true);
    } finally {
      setInstallPrompt(null);
    }
  }

  useEffect(() => {
    let active = true;
    if (!initial.orders.length) {
      setOrdersLoaded(true);
      return () => { active = false; };
    }
    Promise.allSettled(initial.orders.map(async (cached) => {
      const { order } = await apiRequest(`/api/orders?id=${encodeURIComponent(cached.id)}`);
      if (order.id !== cached.id) throw new Error('Order API returned a different order ID.');
      return { ...cached, ...order, managementToken: cached.managementToken };
    })).then((results) => {
      if (!active) return;
      const verified = results.filter((result) => result.status === 'fulfilled').map((result) => result.value);
      const failures = results.filter((result) => result.status === 'rejected');
      setOrders(verified);
      setOrdersLoaded(true);
      setStorageError(failures.length
        ? `${failures.length} saved order lookup(s) could not be verified; unverified records were hidden.`
        : '');
    });
    return () => { active = false; };
  }, [initial]);

  useEffect(() => {
    if (!ordersLoaded) return;
    try {
      localStorage.setItem(ORDER_STORAGE_KEY, JSON.stringify(orders));
    } catch (error) {
      setStorageError(error.message || 'Orders could not be saved in this browser.');
    }
  }, [orders, ordersLoaded]);

  useEffect(() => {
    let active = true;
    setCatalogLoading(true);
    apiRequest('/api/products').then(({ products: items }) => {
      if (!active) return;
      setProducts(items);
      setCatalogError('');
      setCatalogLoading(false);
    }).catch((error) => {
      if (!active) return;
      setCatalogError(error.message);
      setCatalogLoading(false);
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!sharedOrderId) return undefined;
    let active = true;
    apiRequest(`/api/orders?id=${encodeURIComponent(sharedOrderId)}`).then(({ order }) => {
      if (!active) return;
      const cached = orders.find((item) => item.id === order.id);
      const freshOrder = { ...cached, ...order, managementToken: cached?.managementToken };
      setOrders((current) => current.some((item) => item.id === order.id)
        ? current.map((item) => item.id === order.id ? freshOrder : item)
        : [freshOrder, ...current]);
      setSelectedId(order.id);
      setSelectedProduct({ id: order.productId, name: order.product, description: order.description, amount: order.amount, token: order.token, imageUrl: order.imageUrl });
      setView('checkout');
    }).catch((error) => { if (active) setNotice(error.message); });
    return () => { active = false; };
  }, [sharedOrderId]);

  const liveOrderKey = orders.filter((order) => String(order.tx).startsWith('0x')).map((order) => `${order.id}:${order.tx}`).join('|');
  useEffect(() => {
    const escrowAddress = import.meta.env.VITE_TENDER_ESCROW_ADDRESS;
    if (!escrowAddress || !liveOrderKey) return undefined;
    let active = true;
    const syncChainState = async () => {
      const liveOrders = orders.filter((order) => String(order.tx).startsWith('0x'));
      let delayed = false;
      const results = await Promise.all(liveOrders.map(async (order) => {
        try {
          return [order.id, await readEscrowOrder({ orderId: order.id, escrowAddress })];
        } catch {
          // Moderato RPC can briefly time out. Keep the server-confirmed order state and retry on the next poll.
          delayed = true;
          return [order.id, null];
        }
      }));
      if (!active) return;
      if (delayed) setNotice('Tempo status check is delayed. Showing the last confirmed order state and retrying.');
      const states = new Map(results);
      setOrders((current) => current.map((order) => {
        const chain = states.get(order.id);
        if (!chain) return order;
        const status = chain.refunded ? 'refunded' : chain.released ? 'captured' : order.status;
        return status === order.status ? order : { ...order, status, chainVerified: true, buyer: chain.buyer };
      }));
    };
    const reportSyncDelay = () => { if (active) setNotice('Tempo status check is delayed. Showing the last confirmed order state and retrying.'); };
    syncChainState().catch(reportSyncDelay);
    const timer = window.setInterval(() => syncChainState().catch(reportSyncDelay), 8000);
    return () => { active = false; window.clearInterval(timer); };
  }, [liveOrderKey]);

  async function refreshOrders() {
    if (!orders.length) {
      setNotice('There are no saved order IDs in this browser to refresh.');
      return;
    }
    setRefreshing(true);
    try {
      const fresh = await Promise.all(orders.map(async (cached) => {
        const { order } = await apiRequest(`/api/orders?id=${encodeURIComponent(cached.id)}`);
        return { ...cached, ...order, managementToken: cached.managementToken };
      }));
      setOrders(fresh);
      setStorageError('');
      setLastSynced(new Date().toISOString());
      setNotice('Saved orders refreshed from Tender storage.');
    } catch (error) {
      setNotice(`Order refresh failed: ${error.message}`);
    } finally {
      setRefreshing(false);
    }
  }

  async function copyText(text, successMessage) {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        setNotice(successMessage);
        return;
      }
    } catch {
      // In-app wallet browsers often deny navigator.clipboard. Try their legacy copy API.
    }
    try {
      const field = document.createElement('textarea');
      field.value = text;
      field.setAttribute('readonly', '');
      field.style.position = 'fixed';
      field.style.opacity = '0';
      document.body.appendChild(field);
      field.focus();
      field.select();
      const copied = document.execCommand('copy');
      field.remove();
      if (copied) {
        setNotice(successMessage);
        return;
      }
    } catch {
      // Fall through to a selectable value. No copy API is guaranteed in wallet browsers.
    }
    setCopyFallback(text);
    setNotice('Clipboard access is blocked here. Select the value to copy it.');
  }

  async function updateOrderStatus(status) {
    if (!selectedOrder || settling) return;
    setSettling(true);
    try {
      let tx = selectedOrder.tx;
      const escrowAddress = import.meta.env.VITE_TENDER_ESCROW_ADDRESS;
      const merchantAddress = import.meta.env.VITE_TENDER_MERCHANT_ADDRESS;
      if (['captured', 'refunded'].includes(status) && String(selectedOrder.tx).startsWith('0x')) {
        if (!isConnected || !onTempo || !walletClient || !address) throw new Error('Connect an authorized wallet on Tempo Moderato to settle this order.');
        tx = await settleProtectedPayment({ walletClient, account: address, orderId: selectedOrder.id, escrowAddress, merchantAddress, action: status === 'captured' ? 'capture' : 'refund' });
      }
      const apiStatus = status;
      if (apiStatus === 'fulfilled' || ['captured', 'refunded'].includes(apiStatus)) {
        await apiRequest('/api/orders', {
          method: 'PATCH',
          headers: selectedOrder.managementToken ? { 'x-tender-management-token': selectedOrder.managementToken } : {},
          body: JSON.stringify({ id: selectedOrder.id, status: apiStatus, tx: String(tx).startsWith('0x') ? tx : selectedOrder.tx }),
        });
      }
      setOrders((current) => current.map((order) => order.id === selectedOrder.id ? { ...order, status, tx } : order));
      setNotice(status === 'captured' ? 'Tempo confirmed the payment capture.' : status === 'refunded' ? 'Tempo confirmed the refund.' : 'Fulfillment status saved.');
    } catch (error) {
      setNotice(error?.shortMessage || error?.message || 'Order update failed.');
    } finally { setSettling(false); }
  }

  async function connectWallet() {
    if (walletBusy) return;
    setWalletBusy(true);
    try {
      if (!isConnected) {
        const mobileDevice = /android|iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent));
        if (mobileDevice) {
          const candidates = connectors.filter((connector) => connector.type === 'injected')
            .sort((a, b) => Number(a.id === 'injected') - Number(b.id === 'injected'));
          let injected;
          let provider;
          for (const candidate of candidates) {
            const detected = await candidate.getProvider();
            if (detected?.request) { injected = candidate; provider = detected; break; }
          }
          if (provider?.request) {
            try {
              await connectAsync({ connector: injected });
              return;
            } catch (connectionError) {
              if (connectionError?.code === 4001 || connectionError?.name === 'UserRejectedRequestError') {
                setNotice('You declined the wallet connection. Tap Connect wallet to try again.');
                return;
              }
              throw connectionError;
            }
          }
        }
        await open({ view: 'Connect' });
        return;
      }
      if (!onTempo) { await switchChainAsync({ chainId: TEMPO_MODERATO.id }); return; }
      await open({ view: 'Account' });
    } catch (error) {
      setNotice(error?.shortMessage || error?.message || 'Wallet connection failed. Open wallet help to retry.');
      setWalletHelp(true);
    } finally {
      setWalletBusy(false);
    }
  }

  function disconnectWallet() {
    try {
      disconnect();
      setWalletHelp(false);
      setNotice('Wallet disconnected.');
    } catch (error) {
      setNotice(error?.shortMessage || error?.message || 'The wallet could not be disconnected.');
    }
  }

  async function addTempoNetwork() {
    if (!activeConnector || walletBusy) return;
    setWalletBusy(true);
    try {
      const provider = await activeConnector.getProvider();
      await provider.request({ method: 'wallet_addEthereumChain', params: [{
        chainId: '0xa5bf', chainName: TEMPO_MODERATO.name,
        nativeCurrency: TEMPO_MODERATO.nativeCurrency,
        rpcUrls: TEMPO_MODERATO.rpcUrls.default.http,
        blockExplorerUrls: [TEMPO_MODERATO.blockExplorers.default.url],
      }] });
      await switchChainAsync({ chainId: TEMPO_MODERATO.id });
      const actual = await provider.request({ method: 'eth_chainId' });
      if (Number(actual) !== TEMPO_MODERATO.id) throw new Error('Tempo was added, but your wallet has not switched. Select Tempo Moderato in your wallet.');
      setWalletHelp(false);
      setNotice('Your wallet is on Tempo Moderato.');
    } catch (error) {
      setNotice(error?.shortMessage || error?.message || 'This wallet could not add Tempo Moderato. Use the network settings in wallet help.');
    } finally { setWalletBusy(false); }
  }

  async function completeCheckout() {
    if (!selectedProduct) {
      setNotice(catalogError || 'Choose a product from the connected store catalog first.');
      return;
    }
    setCheckoutState('processing');
    const escrowAddress = import.meta.env.VITE_TENDER_ESCROW_ADDRESS;
    const merchantAddress = import.meta.env.VITE_TENDER_MERCHANT_ADDRESS;
    let order = orders.find((item) => item.id === sharedOrderId);
    try {
      if (!sharedOrderId) throw new Error('Open a merchant-created order link before paying.');
      if (!escrowAddress || !merchantAddress) throw new Error('Tender escrow and merchant addresses are not configured.');
      if (!isConnected || !onTempo || !walletClient || !address) throw new Error('Connect a wallet on Tempo Moderato before paying.');
      if (tokenConfigError) throw new Error(tokenConfigError);
      if (selectedProduct.token !== paymentTokenSymbol) throw new Error(`This catalog item uses ${selectedProduct.token}; the connected checkout is configured for ${paymentTokenSymbol}.`);
      if (!order) {
        const loaded = await apiRequest(`/api/orders?id=${encodeURIComponent(sharedOrderId)}`);
        order = loaded.order;
        setOrders((current) => [order, ...current]);
      }
      if (order.status !== 'pending') throw new Error('This order is not awaiting payment. Refresh it to see the current status.');
      const deadline = Math.floor(new Date(order.deadline).getTime() / 1000);
      const tx = await reserveProtectedPayment({ walletClient, account: address, amount: order.amount, orderId: order.id, deadline, escrowAddress, merchantAddress, tokenAddress: configuredTokenAddress });
      order = { ...order, status: 'reserved', tx, buyer: address };
      setOrders((current) => current.map((item) => item.id === order.id ? order : item));
      await apiRequest('/api/orders', { method: 'PATCH', body: JSON.stringify({ id: order.id, status: 'reserved', tx }) });
      setSelectedId(order.id);
      setCheckoutState('complete');
      await copyText(checkoutLink(order.id), 'Payment confirmed and checkout link copied.');
    } catch (error) {
      setCheckoutState('idle');
      if (order?.tx) setNotice(`Payment is confirmed on Tempo, but order storage update failed: ${error.message}`);
      else setNotice(error?.shortMessage || error?.message || 'Payment was not completed.');
    }
  }

  async function startCheckout(product) {
    setBuying(true);
    try {
      const { order, managementToken } = await apiRequest('/api/orders', { method: 'POST', body: JSON.stringify({ productId: product.id, deadline: new Date(Date.now() + 86400000).toISOString() }) });
      setOrders((current) => [{ ...order, managementToken }, ...current]);
      setSelectedId(order.id);
      setSelectedProduct(product);
      setCheckoutState('idle');
      window.location.hash = '/checkout?order=' + encodeURIComponent(order.id);
      setView('checkout');
      window.scrollTo({ top: 0 });
    } catch (error) { setNotice(error.message); } finally { setBuying(false); }
  }

  async function createOrder(event) {
    event.preventDefault();
    try {
      const created = await apiRequest('/api/orders', { method: 'POST', body: JSON.stringify({ productId: newOrderProductId, amount: newOrderAmount, deadline: new Date(newOrderDeadline).toISOString() }) });
      const order = { ...created.order, managementToken: created.managementToken };
      setOrders((current) => [order, ...current]);
      setSelectedId(order.id);
      setNewOrderOpen(false);
      setNewOrderProductId('');
      setNewOrderAmount('');
      setNewOrderDeadline('');
      const link = checkoutLink(order.id);
      setCreatedOrderLink(link);
      await copyText(link, 'Order created and checkout link copied.');
    } catch (error) {
      setNotice(error.message);
    }
  }

  const connectedNetworkLabel = isConnected ? (onTempo ? 'Wallet on Tempo Moderato' : 'Wallet on another network') : 'Wallet not connected';
  const storeLabel = storeName || 'Tender workspace';
  const canRefundSelected = Boolean(selectedOrder && (
    (address && selectedOrder.buyer && address.toLowerCase() === selectedOrder.buyer.toLowerCase())
    || (selectedOrder.deadline && Date.now() >= new Date(selectedOrder.deadline).getTime())
  ));

  return <div className={`app-shell view-${view}`}>
    <aside className="sidebar">
      <Brand />
      <div className="workspace"><span className="workspace-icon">{storeName ? storeName.slice(0, 1).toUpperCase() : '?'}</span><div><strong>{storeLabel}</strong><small>Local order list</small></div></div>
      <p className="nav-label">YOUR TENDER</p>
      <nav aria-label="Main navigation">
        <button className={`nav-item ${view === 'home' ? 'active' : ''}`} onClick={() => setView('home')}><Icon name="box"/>Sell</button>
        <button className={`nav-item ${view === 'wallet' ? 'active' : ''}`} onClick={() => setView('wallet')}><Icon name="wallet"/>Wallet</button>
        <button className={`nav-item ${view === 'merchant' ? 'active' : ''}`} onClick={() => setView('merchant')}><Icon name="box"/>Orders <b>{orders.length}</b></button>
        <button className={`nav-item ${view === 'checkout' ? 'active' : ''}`} onClick={() => setView('checkout')}><Icon name="lock"/>Buy</button>
      </nav>
      <div className="sidebar-bottom">
        <div className="network"><span className={`network-dot ${isConnected && onTempo ? 'online' : isConnected ? 'offline' : 'unknown'}`} /><div><strong>Tempo Moderato</strong><small>{connectedNetworkLabel}</small></div></div>
        <div className="help">Tender · Tempo Moderato</div>
      </div>
    </aside>
    <main className="main">
      <header className="topbar">
        <div className="breadcrumbs">{storeLabel} <span>/</span> <strong>{{home: 'Sell', wallet: 'Wallet', merchant: 'Orders', checkout: 'Buy'}[view]}</strong></div>
        <div className="top-actions"><div className="tempo-badge">Moderato · Testnet</div>{!isInstalled && <button className="install-button" onClick={installApp}><Icon name="download" />Install</button>}<button className={`wallet-button ${wallet ? 'connected' : ''} ${view === 'checkout' ? 'checkout-wallet' : ''}`} onClick={connectWallet}><Icon name="wallet" />{wallet || 'Connect wallet'}</button></div>
      </header>
      {view === 'home' ? <Home products={products} loading={catalogLoading} error={catalogError} buy={startCheckout} busy={buying} navigate={setView} connect={connectWallet} connected={isConnected} install={installApp}/> : view === 'wallet' ? <WalletPanel address={address} onTempo={onTempo} walletClient={walletClient} connect={connectWallet} tokenAddress={configuredTokenAddress} tokenSymbol={paymentTokenSymbol} notify={setNotice}/> : view === 'merchant' ? <section className="content">
        <div className="heading"><div><p className="eyebrow">MERCHANT WORKSPACE</p><h1>Post and settle orders.</h1><p className="subtitle">Create a checkout link, share it with a buyer, then fulfill and capture or refund the payment.</p></div><button className="primary-button" onClick={() => { setNewOrderProductId(products[0]?.id || ''); setNewOrderOpen(true); }} disabled={!products.length}>Create protected order <Icon name="arrow" /></button></div>
        <div className="stats">
          <div className="stat-card"><span>Payments in escrow</span><strong>{stats.reserved}</strong><small>Only IDs saved in this browser</small></div>
          <div className="stat-card"><span>Settled orders</span><strong>{stats.captured}</strong><small>Only IDs saved in this browser</small></div>
          <div className="stat-card"><span>Last server refresh</span><strong>{lastSynced ? displayDate(lastSynced) : 'Not refreshed'}</strong><small>{lastSynced ? 'Order API response received' : 'Refresh to check saved order IDs'}</small></div>
        </div>
        <div className="workspace-grid">
          <section className="panel orders-panel">
            <div className="panel-title"><div><h2>Saved orders</h2><p>Only orders stored in this browser are listed.</p></div><button className="quiet-button" onClick={refreshOrders} disabled={refreshing}>{refreshing ? 'Refreshing…' : 'Refresh'}</button></div>
            {storageError && <div className="empty-state" role="alert">{storageError}</div>}
            <div className="order-list">{orders.map((order) => <button className={`order-row ${selectedId === order.id ? 'selected' : ''}`} key={order.id} onClick={() => setSelectedId(order.id)}>
              <span className={`order-icon ${statusMeta[order.status]?.className || ''}`}><Icon name={order.status === 'captured' ? 'check' : 'box'} /></span>
              <span className="order-main"><strong>{order.product || 'Product name unavailable'}</strong><small>{order.id} · {order.buyer ? shortAddress(order.buyer) : 'Buyer not recorded'}</small></span>
              <span className="order-amount">{money(order.amount)} <small>{order.token}</small></span><StatusPill status={order.status} /><Icon name="arrow" />
            </button>)}</div>
            {!ordersLoaded && <div className="empty-state">Verifying saved order IDs with Tender storage…</div>}
            {ordersLoaded && !orders.length && <div className="empty-state">Your next order starts here. Explore a service or create an order to share a checkout link.</div>}
            <div className="panel-foot"><span>{orders.length} locally saved order IDs</span><span>Tempo Moderato</span></div>
          </section>
          <section className="panel detail-panel">{selectedOrder ? <>
            <div className="detail-heading"><div><p className="eyebrow">ORDER {selectedOrder.id}</p><h2>{selectedOrder.product || 'Product name unavailable'}</h2><p>Buyer {selectedOrder.buyer ? shortAddress(selectedOrder.buyer) : 'not recorded'}</p></div><StatusPill status={selectedOrder.status} /></div>
            <div className="amount-line"><div><span>Order total</span><small>{selectedOrder.token || 'Token not recorded'}</small></div><strong>{money(selectedOrder.amount)} <em>{selectedOrder.token || 'Token not recorded'}</em></strong></div>
            <div className="timeline">
              <div className="timeline-item complete"><span><Icon name="check" /></span><div><strong>Order created</strong><small>{displayDate(selectedOrder.created)}</small></div></div>
              <div className={`timeline-item ${['reserved', 'fulfilled', 'captured', 'refunded'].includes(selectedOrder.status) ? 'complete' : ''}`}><span><Icon name="lock" /></span><div><strong>Payment reserved</strong><small>{selectedOrder.tx || 'No payment transaction recorded'}</small></div></div>
              <div className={`timeline-item ${['fulfilled', 'captured'].includes(selectedOrder.status) ? 'complete' : ''}`}><span><Icon name="box" /></span><div><strong>Delivery marked</strong><small>{selectedOrder.status === 'fulfilled' || selectedOrder.status === 'captured' ? 'Recorded in order storage' : 'Not recorded'}</small></div></div>
              <div className={`timeline-item ${selectedOrder.status === 'captured' ? 'complete' : ''}`}><span><Icon name="check" /></span><div><strong>Payment capture</strong><small>{selectedOrder.status === 'captured' ? selectedOrder.tx : 'Not captured'}</small></div></div>
            </div>
            {['reserved', 'fulfilled'].includes(selectedOrder.status) && <div className="action-box"><div><strong>{selectedOrder.status === 'reserved' ? 'Review your delivery' : 'Capture payment'}</strong><p>{selectedOrder.status === 'reserved' ? 'Create and download your design below, then mark it delivered.' : 'This releases payment to the merchant. Capture cannot be refunded.'}</p></div>{selectedOrder.status === 'reserved' ? <button className="primary-button" disabled={settling} onClick={() => updateOrderStatus('fulfilled')}>Mark delivered <Icon name="arrow" /></button> : <button className="primary-button" disabled={settling} onClick={() => updateOrderStatus('captured')}>Capture <Icon name="check" /></button>}</div>}
            {selectedOrder.status === 'captured' && <div className="success-box"><span><Icon name="check" /></span><div><strong>Capture confirmed</strong><p>Escrow state reports the payment released.</p></div></div>}
            {['reserved', 'fulfilled'].includes(selectedOrder.status) && canRefundSelected && <button className="text-action" disabled={settling} onClick={() => updateOrderStatus('refunded')}><Icon name="refund" /> Refund order</button>}
            {['tender-brand-card', 'tender-launch-graphic'].includes(selectedOrder.productId) && ['reserved', 'fulfilled', 'captured'].includes(selectedOrder.status) && <DesignStudio key={selectedOrder.id} order={selectedOrder}/>}<div className="detail-footer"><span><Icon name="lock" />{selectedOrder.tx ? 'Payment transaction recorded on Tempo' : 'No Tempo transaction recorded'}</span><button onClick={() => selectedOrder.tx ? copyText(`Order ${selectedOrder.id}\nTransaction ${selectedOrder.tx}`, 'Transaction receipt copied.') : setNotice('No transaction is recorded for this order.')}>Copy receipt</button></div>
          </> : <div className="detail-empty"><Icon name="box"/><p className="eyebrow">ROOM FOR WHAT’S NEXT</p><h2>The details,<br/>all in one place.</h2><p>Select an order to see the brief, payment, and delivery status.</p><button className="secondary-button" onClick={() => setView('home')}>Explore services ↗</button></div>}</section>
        </div>
      </section> : <section className="checkout-view">
        <div className="checkout-intro"><p className="eyebrow">BUYER CHECKOUT</p><h1>Pay the order.</h1><p>Review the merchant’s item and amount, connect your Tempo wallet, then reserve payment until fulfillment. Test tokens have no monetary value.</p><span className="connection-note">{connectedNetworkLabel}</span>{tokenConfigError && <div className="empty-state" role="alert">{tokenConfigError}</div>}</div>
        {sharedOrderId && !selectedProduct && <div className="empty-state" role="status">Loading order from Tender storage…</div>}
        {!sharedOrderId && <div className="product-grid">{products.map((product) => <button key={product.id} className={`product-card ${selectedProduct?.id === product.id ? 'chosen' : ''}`} onClick={() => startCheckout(product)} disabled={buying}>
          <ProductArt product={product} /><div className="product-copy"><h2>{product.name}</h2><p>{product.description}</p><strong>{money(product.amount)} <small>{product.token}</small></strong></div>
        </button>)}</div>}
        {catalogLoading && !sharedOrderId && <div className="empty-state">Loading catalog…</div>}
        {catalogError && !sharedOrderId && <div className="empty-state" role="alert">Catalog could not be loaded: {catalogError}</div>}
        {!catalogLoading && !catalogError && !products.length && !sharedOrderId && <div className="empty-state">No active products are configured for this store.</div>}
        {selectedProduct && <div className="shop-layout"><div className="checkout-product"><ProductArt product={selectedProduct} /><div><strong>{selectedProduct.name}</strong><small>{selectedProduct.description}</small></div><b>{money(selectedProduct.amount)} {selectedProduct.token}</b></div><aside className="checkout-card">
          <div className="checkout-card-head"><span>ORDER TOTAL</span><span className="secure"><Icon name="lock" /> Escrow</span></div>
          <div className="checkout-total"><span>{selectedProduct.name}</span><strong>{money(selectedProduct.amount)} <small>{selectedProduct.token}</small></strong></div>
          <div className="protection-note"><Icon name="lock" /><div><strong>Tempo escrow</strong><p>Approve pathUSD, then confirm the deposit in your wallet. The funds stay in escrow until you or the merchant captures them. Refunds are possible before capture; the contract does not check delivery.</p></div></div>
          {(() => { const checkoutOrder = sharedOrderId && orders.find((item) => item.id === sharedOrderId); const paidStatus = checkoutOrder?.status && checkoutOrder.status !== 'pending'; const paidLabel = checkoutOrder?.status === 'captured' ? 'Payment settled' : checkoutOrder?.status === 'refunded' ? 'Payment refunded' : paidStatus ? 'Payment reserved' : ''; return <><button className="checkout-pay" onClick={sharedOrderId && isConnected && onTempo ? completeCheckout : connectWallet} disabled={checkoutState === 'processing' || checkoutState === 'complete' || paidStatus || !selectedProduct || !sharedOrderId || Boolean(tokenConfigError)}>{checkoutState === 'processing' ? 'Waiting for wallet…' : checkoutState === 'complete' || paidStatus ? paidLabel : tokenConfigError ? 'Token configuration required' : !sharedOrderId ? 'Open an order link to pay' : !isConnected ? 'Connect wallet to pay' : !onTempo ? 'Switch to Tempo' : 'Pay and reserve'} <Icon name={checkoutState === 'complete' || paidStatus ? 'check' : 'arrow'} /></button>{paidStatus && <p className="checkout-state-note">This order already has a payment on Tempo. Open Orders to review delivery or settlement.</p>}</>; })()}
          <button className="text-action" onClick={() => setView('merchant')}>View order & delivery →</button><small className="checkout-foot">Network: Tempo Moderato · Token: {selectedProduct.token}</small>
        </aside></div>}
        {sharedOrderId && orders.find((item) => item.id === sharedOrderId) && ['reserved', 'fulfilled', 'captured'].includes(orders.find((item) => item.id === sharedOrderId).status) && ['tender-brand-card', 'tender-launch-graphic'].includes(selectedProduct?.id) && <DesignStudio key={sharedOrderId} order={orders.find((item) => item.id === sharedOrderId)}/>}
      </section>}
    </main>
    <button className="wallet-help-link" onClick={() => setWalletHelp(true)}>Wallet connection help</button>
    {walletHelp && <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setWalletHelp(false)}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="wallet-help-title">
      <button className="modal-close" onClick={() => setWalletHelp(false)} aria-label="Close wallet help"><Icon name="close"/></button>
      <p className="eyebrow">WALLET CONNECTION</p><h2 id="wallet-help-title">Connect, then select Tempo.</h2>
      <p className="modal-subtitle">In a wallet browser, approve its connection request. In Chrome or Safari, select your wallet in the picker. If it does not launch automatically, tap Open on the wallet screen.</p>
      <p className="modal-subtitle">Tender payments use Moderato testnet. Your wallet must support adding custom EVM networks. A WalletConnect connection alone does not add this network.</p>
      <dl className="network-settings"><dt>Network</dt><dd>Tempo Moderato</dd><dt>Chain ID</dt><dd>42431</dd><dt>RPC URL</dt><dd>https://rpc.moderato.tempo.xyz</dd><dt>Currency</dt><dd>USD · 6 decimals</dd><dt>Explorer</dt><dd>https://explore.testnet.tempo.xyz</dd></dl>
      <div className="modal-actions"><button className="secondary-button" onClick={() => { setWalletHelp(false); open({ view: 'Connect' }); }}>Choose wallet</button>{isConnected && <><button className="secondary-button" onClick={disconnectWallet}>Disconnect wallet</button><button className="primary-button" disabled={walletBusy} onClick={addTempoNetwork}>{walletBusy ? 'Check your wallet…' : 'Add / switch to Tempo'}</button></>}</div>
    </section></div>}
    {copyFallback && <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setCopyFallback('')}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="copy-title">
      <button className="modal-close" onClick={() => setCopyFallback('')} aria-label="Close"><Icon name="close" /></button><p className="eyebrow">COPY VALUE</p><h2 id="copy-title">Select and copy</h2><p className="modal-subtitle">This wallet browser blocked clipboard access. Press and hold the field, then choose Copy.</p><textarea className="copy-fallback-field" readOnly value={copyFallback} onFocus={(event) => event.target.select()} aria-label="Value to copy" /><div className="modal-actions"><button className="primary-button" onClick={() => setCopyFallback('')}>Done</button></div>
    </section></div>}
    {notice && <div className="toast" role="status"><span>{notice}</span><button onClick={() => setNotice('')} aria-label="Dismiss"><Icon name="close" /></button></div>}
    {newOrderOpen && <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setNewOrderOpen(false)}><form className="modal" onSubmit={createOrder}>
      <button type="button" className="modal-close" onClick={() => setNewOrderOpen(false)} aria-label="Close"><Icon name="close" /></button><p className="eyebrow">MERCHANT CHECKOUT</p><h2>Create a protected order</h2>
      <label>Product<select required value={newOrderProductId} onChange={(event) => { const id = event.target.value; const product = products.find((item) => item.id === id); setNewOrderProductId(id); setNewOrderAmount(product?.amount || ''); }}><option value="">Choose from store catalog</option>{products.map((product) => <option key={product.id} value={product.id}>{product.name} · {money(product.amount)} {product.token}</option>)}</select></label>
      <label>Your price<input required type="number" min="0.01" max="1000000" step="0.01" value={newOrderAmount} onChange={(event) => setNewOrderAmount(event.target.value)} placeholder="0.10" /><small className="form-hint">Set the amount the buyer will reserve in {products.find((item) => item.id === newOrderProductId)?.token || 'the listing token'}.</small></label>
      <label>Fulfillment deadline<input type="datetime-local" required value={newOrderDeadline} onChange={(event) => setNewOrderDeadline(event.target.value)} /></label>
      <div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setNewOrderOpen(false)}>Cancel</button><button className="primary-button" disabled={!newOrderProductId}>Create order <Icon name="arrow" /></button></div>
    </form></div>}
    {createdOrderLink && <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setCreatedOrderLink('')}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="order-created-title">
      <button className="modal-close" onClick={() => setCreatedOrderLink('')} aria-label="Close"><Icon name="close" /></button><p className="eyebrow">ORDER READY</p><h2 id="order-created-title">Share this buyer checkout.</h2><p className="modal-subtitle">Send this link to the buyer. They can review the order and reserve payment in their wallet. Your order stays open until you fulfill, capture, or refund it.</p><textarea className="copy-fallback-field" readOnly value={createdOrderLink} onFocus={(event) => event.target.select()} aria-label="Buyer checkout link" /><div className="modal-actions"><button className="secondary-button" onClick={() => { setCreatedOrderLink(''); setView('merchant'); }}>Open Orders</button><button className="primary-button" onClick={() => { setCreatedOrderLink(''); setView('checkout'); window.location.hash = createdOrderLink.replace(window.location.origin, ''); }}>Open buyer view <Icon name="arrow" /></button></div>
    </section></div>}
    {showInstallHelp && <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setShowInstallHelp(false)}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="install-title">
      <button type="button" className="modal-close" onClick={() => setShowInstallHelp(false)} aria-label="Close"><Icon name="close" /></button><p className="eyebrow">TENDER APP</p><h2 id="install-title">Add Tender to your device</h2>
      <p className="modal-subtitle">In your browser menu, choose <strong>Install app</strong> or <strong>Add to Home Screen</strong>. On iPhone or iPad, open Tender in Safari and use Share → Add to Home Screen.</p>
      <p className="modal-subtitle">Tender can reopen as an app. Product and order data, wallet actions, and payments still need an internet connection.</p>
      <div className="modal-actions"><button type="button" className="primary-button" onClick={() => setShowInstallHelp(false)}>Got it</button></div>
    </section></div>}
  </div>;
}

export default App;
