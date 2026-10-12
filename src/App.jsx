import { useEffect, useMemo, useState } from 'react';
import { readEscrowOrder, reserveProtectedPayment, settleProtectedPayment } from './tempo';

const products = [
  { name: 'Field Notes — limited edition', description: 'A stitched notebook for ideas in motion.', price: '42.00', tag: 'Best seller', color: 'ochre' },
  { name: 'Canvas Utility Tote', description: 'Heavy canvas. Daily carry. No fuss.', price: '68.00', tag: 'New', color: 'blue' },
  { name: 'Ceramic travel mug', description: 'Keeps the first cup warm until the last mile.', price: '24.00', tag: 'In stock', color: 'rose' },
];

const initialOrders = [];

const statusMeta = {
  reserved: { label: 'Payment reserved', className: 'reserved' }, fulfilled: { label: 'Ready to capture', className: 'fulfilled' }, captured: { label: 'Captured', className: 'captured' }, canceled: { label: 'Canceled', className: 'canceled' }, refunded: { label: 'Refunded', className: 'refunded' }, expired: { label: 'Expired', className: 'expired' },
};
const ORDER_STORAGE_KEY = 'tender.orders.v3';
function loadOrders() {
  try { return JSON.parse(localStorage.getItem(ORDER_STORAGE_KEY)) || initialOrders; }
  catch { return initialOrders; }
}

function money(value) { return new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value)); }
function checkoutLink(orderId) { return `${window.location.origin}/#/checkout?order=${encodeURIComponent(orderId)}`; }
function Icon({ name }) {
  const paths = { arrow: <><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></>, check: <path d="m5 12 4 4L19 6" />, close: <><path d="m6 6 12 12" /><path d="m18 6-12 12" /></>, lock: <><rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></>, wallet: <><path d="M4 7h16v12H4z" /><path d="M4 7V5h13" /><path d="M16 14h.01" /></>, box: <><path d="m4 7 8-4 8 4-8 4z" /><path d="M4 7v10l8 4 8-4V7" /><path d="M12 11v10" /></>, refund: <><path d="M4 7v5h5" /><path d="M5 12a7 7 0 1 0 2-5" /></>, external: <><path d="M14 4h6v6" /><path d="m20 4-9 9" /><path d="M18 13v6H5V6h6" /></> };
  return <svg viewBox="0 0 24 24" aria-hidden="true">{paths[name]}</svg>;
}
function Brand() { return <div className="brand"><span className="brand-mark">t</span><span>Tender</span></div>; }
function StatusPill({ status }) { const meta = statusMeta[status] || statusMeta.reserved; return <span className={`status-pill ${meta.className}`}><span className="status-dot" />{meta.label}</span>; }
function IntegrationView({ onNotice }) {
  return <section className="integration-view"><div className="heading"><div><p className="eyebrow">MERCHANT INTEGRATION</p><h1>Connect Tender to your store.</h1><p className="subtitle">Create an order, render checkout, and receive fulfillment events through one small integration.</p></div><button className="primary-button" onClick={() => onNotice('Integration request copied.')}>Request access <Icon name="arrow" /></button></div><div className="integration-grid"><section className="integration-card"><div className="integration-number">01</div><div><h2>Install the checkout</h2><p>Add Tender to a product or checkout page. Your store keeps its existing catalog and fulfillment flow.</p><pre><code>{`<script src="https://tender.run/checkout.js"></script>\n<tender-checkout order="ORDER_ID" />`}</code></pre><button className="copy-button" onClick={() => onNotice('Checkout snippet copied.')}>Copy snippet</button></div></section><section className="integration-card"><div className="integration-number">02</div><div><h2>Create protected orders</h2><p>Use the order API to bind the cart total, merchant wallet, and fulfillment deadline to a Tempo payment.</p><pre><code>{`POST /v1/orders\n{ amount, token, deadline, metadata }`}</code></pre><button className="copy-button" onClick={() => onNotice('API example copied.')}>Copy example</button></div></section><section className="integration-card"><div className="integration-number">03</div><div><h2>Send fulfillment events</h2><p>When your store ships, call the fulfillment endpoint. Tender then makes capture available to the merchant.</p><div className="event-list"><span><b>order.reserved</b><small>Payment received</small></span><span><b>order.fulfilled</b><small>Release becomes available</small></span><span><b>order.refunded</b><small>Funds returned to buyer</small></span></div></div></section></div><div className="integration-note"><Icon name="lock" /><div><strong>Tempo Moderato is the active network</strong><p>The current demo uses local data. The production adapter will submit the escrow lifecycle to Tempo and sign webhook deliveries.</p></div></div></section>;
}

function App() {
  const [orders, setOrders] = useState(loadOrders);
  const [selectedId, setSelectedId] = useState(initialOrders[0]?.id || null);
  const [view, setView] = useState('merchant');
  const [notice, setNotice] = useState('');
  const [wallet, setWallet] = useState('');
  const [selectedProduct, setSelectedProduct] = useState(products[0]);
  const [checkoutState, setCheckoutState] = useState('idle');
  const [newOrderOpen, setNewOrderOpen] = useState(false);
  const [newOrder, setNewOrder] = useState({ customer: '', email: '', product: products[0].name });
  const sharedOrderId = new URLSearchParams(window.location.hash.split('?')[1] || '').get('order');
  const selectedOrder = orders.find((order) => order.id === selectedId) || orders[0];
  const stats = useMemo(() => ({ reserved: orders.filter((order) => order.status === 'reserved').length, protected: orders.filter((order) => ['reserved', 'fulfilled'].includes(order.status)).reduce((sum, order) => sum + Number(order.amount), 0), captured: orders.filter((order) => order.status === 'captured').reduce((sum, order) => sum + Number(order.amount), 0) }), [orders]);
  useEffect(() => { localStorage.setItem(ORDER_STORAGE_KEY, JSON.stringify(orders)); }, [orders]);
  useEffect(() => {
    if (!sharedOrderId) return;
    const sharedOrder = orders.find((order) => order.id === sharedOrderId);
    if (!sharedOrder) return;
    const product = products.find((item) => item.name === sharedOrder.product);
    if (product) setSelectedProduct(product);
    setView('checkout');
  }, [sharedOrderId, orders]);
  const liveOrderKey = orders.filter((order) => String(order.tx).startsWith('0x')).map((order) => `${order.id}:${order.tx}`).join('|');
  useEffect(() => {
    const escrowAddress = import.meta.env.VITE_TENDER_ESCROW_ADDRESS;
    if (!escrowAddress || !liveOrderKey) return undefined;
    let active = true;
    const syncChainState = async () => {
      const liveOrders = orders.filter((order) => String(order.tx).startsWith('0x'));
      const results = await Promise.all(liveOrders.map(async (order) => { try { return [order.id, await readEscrowOrder({ orderId: order.id, escrowAddress })]; } catch { return [order.id, null]; } }));
      if (!active) return;
      const states = new Map(results);
      setOrders((current) => {
        let changed = false;
        const next = current.map((order) => {
          const chain = states.get(order.id);
          if (!chain) return order;
          const status = chain.refunded ? 'refunded' : chain.released ? 'captured' : order.status;
          if (status === order.status) return order;
          changed = true;
          return { ...order, status, chainVerified: true };
        });
        return changed ? next : current;
      });
    };
    syncChainState();
    const timer = window.setInterval(syncChainState, 8000);
    return () => { active = false; window.clearInterval(timer); };
  }, [liveOrderKey]);

  async function updateOrderStatus(status) {
    if (!selectedOrder) return;
    try {
      let tx = selectedOrder.tx;
      const escrowAddress = import.meta.env.VITE_TENDER_ESCROW_ADDRESS;
      const merchantAddress = import.meta.env.VITE_TENDER_MERCHANT_ADDRESS;
      if ((status === 'captured' || status === 'refunded' || status === 'canceled') && escrowAddress && merchantAddress && window.ethereum && wallet && String(selectedOrder.tx).startsWith('0x')) {
        const accounts = await window.ethereum.request({ method: 'eth_accounts' });
        tx = await settleProtectedPayment({ provider: window.ethereum, account: accounts[0], orderId: selectedOrder.id, escrowAddress, merchantAddress, action: status === 'captured' ? 'capture' : 'refund' });
      }
      setOrders((current) => current.map((order) => order.id === selectedOrder.id ? { ...order, status, tx } : order));
      setNotice(status === 'captured' ? 'Payment captured and settled to the merchant.' : status === 'refunded' ? 'Refund completed.' : status === 'canceled' ? 'Order canceled and funds returned.' : `Order marked ${status}.`);
    } catch (error) { setNotice(error?.shortMessage || error?.message || 'The order update was not completed.'); }
  }
  async function connectWallet() {
    const provider = window.ethereum;
    if (!provider) { setWallet('0x7c4a…91d2'); setNotice('Demo wallet connected. Install an EVM wallet for live Tempo access.'); return; }
    try {
      const accounts = await provider.request({ method: 'eth_requestAccounts' });
      try { await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0xa5bf' }] }); }
      catch (switchError) {
        if (switchError?.code !== 4902) throw switchError;
        await provider.request({ method: 'wallet_addEthereumChain', params: [{ chainId: '0xa5bf', chainName: 'Tempo Moderato', nativeCurrency: { name: 'USD', symbol: 'USD', decimals: 18 }, rpcUrls: ['https://rpc.moderato.tempo.xyz'], blockExplorerUrls: ['https://explore.tempo.xyz'] }] });
      }
      setWallet(`${accounts[0].slice(0, 6)}…${accounts[0].slice(-4)}`);
      setNotice('Wallet connected to Tempo Moderato.');
    } catch (error) { setNotice(error?.message || 'Wallet connection was cancelled.'); }
  }
  async function completeCheckout() {
    setCheckoutState('processing');
    const id = `TND-${1050 + orders.length}`;
    const deadline = Math.floor(Date.now() / 1000) + 3 * 24 * 60 * 60;
    const escrowAddress = import.meta.env.VITE_TENDER_ESCROW_ADDRESS;
    const merchantAddress = import.meta.env.VITE_TENDER_MERCHANT_ADDRESS;
    try {
      let tx = 'Local demo reservation';
      if (escrowAddress && merchantAddress && window.ethereum && wallet) {
        const accounts = await window.ethereum.request({ method: 'eth_accounts' });
        tx = await reserveProtectedPayment({ provider: window.ethereum, account: accounts[0], amount: selectedProduct.price, orderId: id, deadline, escrowAddress, merchantAddress, tokenAddress: import.meta.env.VITE_TEMPO_TOKEN_ADDRESS });
      } else {
        await new Promise((resolve) => window.setTimeout(resolve, 650));
      }
      const order = { id, product: selectedProduct.name, customer: 'You', email: 'customer@example.com', amount: selectedProduct.price, token: 'USDC', status: 'reserved', created: 'Just now', deadline: new Date(deadline * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }), tx };
      setOrders((current) => [order, ...current]); setSelectedId(id); setCheckoutState('complete');
      const link = checkoutLink(id);
      setNotice(tx === 'Local demo reservation' ? `Demo order reserved. Checkout: ${link}` : `Payment reserved on Tempo. Checkout: ${link}`);
    } catch (error) {
      setCheckoutState('idle');
      setNotice(error?.shortMessage || error?.message || 'Payment was not completed.');
    }
  }
  function createOrder(event) { event.preventDefault(); const product = products.find((item) => item.name === newOrder.product) || products[0]; const id = `TND-${1050 + orders.length}`; const order = { id, product: product.name, customer: newOrder.customer || 'New customer', email: newOrder.email || 'customer@example.com', amount: product.price, token: 'USDC', status: 'reserved', created: 'Just now', deadline: 'Oct 15, 2026', tx: 'Awaiting payment', checkoutUrl: checkoutLink(id) }; setOrders((current) => [order, ...current]); setSelectedId(id); setNewOrderOpen(false); setNewOrder({ customer: '', email: '', product: products[0].name }); setNotice(`Order created. Checkout: ${checkoutLink(id)}`); }

  return <div className="app-shell">
    <aside className="sidebar"><Brand /><div className="workspace"><span className="workspace-icon">N</span><div><strong>Northstar Goods</strong><small>Merchant workspace</small></div><span className="chevron">⌄</span></div><p className="nav-label">WORKSPACE</p><nav><button className={`nav-item ${view === 'merchant' ? 'active' : ''}`} onClick={() => setView('merchant')}><span>▦</span>Orders <b>{orders.length}</b></button><button className={`nav-item ${view === 'checkout' ? 'active' : ''}`} onClick={() => setView('checkout')}><span>⌁</span>Checkout</button><button className="nav-item" onClick={() => setNotice('Integrations are coming after the core Tempo flow.')}><span>⌘</span>Integrations</button></nav><div className="sidebar-bottom"><div className="network"><span className="network-dot" /><div><strong>Tempo Moderato</strong><small>Testnet connected</small></div></div><div className="help">Tender v0.1 <span>·</span> Help</div></div></aside>
    <main className="main"><header className="topbar"><div className="breadcrumbs">Northstar Goods <span>/</span> <strong>{view === 'merchant' ? 'Orders' : view === 'checkout' ? 'Checkout' : 'Integrations'}</strong></div><div className="top-actions"><div className="tempo-badge"><span className="network-dot" /> Tempo Moderato</div><button className={`wallet-button ${wallet ? 'connected' : ''}`} onClick={connectWallet}><Icon name="wallet" />{wallet || 'Connect wallet'}</button></div></header>
      {view === 'merchant' ? <section className="content"><div className="heading"><div><p className="eyebrow">MERCHANT WORKSPACE</p><h1>Orders with a safer settlement.</h1><p className="subtitle">Tender keeps a customer’s payment reserved until you fulfill the order.</p></div><button className="primary-button" onClick={() => setNewOrderOpen(true)}>Create order <Icon name="arrow" /></button></div><div className="stats"><div className="stat-card"><span>Protected orders</span><strong>{stats.reserved}</strong><small>Awaiting fulfillment</small></div><div className="stat-card"><span>Funds reserved</span><strong>${money(stats.protected)}</strong><small>Held against open orders</small></div><div className="stat-card"><span>Settled volume</span><strong>${money(stats.captured)}</strong><small>Captured on Tempo</small></div></div><div className="workspace-grid"><section className="panel orders-panel"><div className="panel-title"><div><h2>Recent orders</h2><p>Payment and fulfillment in one view.</p></div><button className="quiet-button" onClick={() => setNotice('Orders are synced from your store adapter.')}>Sync</button></div><div className="order-list">{orders.map((order) => <button className={`order-row ${selectedId === order.id ? 'selected' : ''}`} key={order.id} onClick={() => setSelectedId(order.id)}><span className={`order-icon ${statusMeta[order.status]?.className || ''}`}><Icon name={order.status === 'captured' ? 'check' : 'box'} /></span><span className="order-main"><strong>{order.product}</strong><small>{order.id} · {order.customer}</small></span><span className="order-amount">${money(order.amount)} <small>{order.token}</small></span><StatusPill status={order.status} /><Icon name="arrow" /></button>)}</div><div className="panel-foot"><span>Showing {orders.length} orders</span><span>All amounts in USD stablecoins</span></div></section><section className="panel detail-panel">{selectedOrder && <><div className="detail-heading"><div><p className="eyebrow">ORDER {selectedOrder.id}</p><h2>{selectedOrder.product}</h2><p>{selectedOrder.customer} · {selectedOrder.email}</p></div><StatusPill status={selectedOrder.status} /></div><div className="amount-line"><div><span>Order total</span><small>Protected on Tempo</small></div><strong>${money(selectedOrder.amount)} <em>{selectedOrder.token}</em></strong></div><div className="timeline"><div className="timeline-item complete"><span><Icon name="check" /></span><div><strong>Order created</strong><small>{selectedOrder.created}</small></div></div><div className={`timeline-item ${['reserved', 'fulfilled', 'captured'].includes(selectedOrder.status) ? 'complete' : ''}`}><span><Icon name="lock" /></span><div><strong>Payment reserved</strong><small>{selectedOrder.tx}</small></div></div><div className={`timeline-item ${['fulfilled', 'captured'].includes(selectedOrder.status) ? 'complete' : ''}`}><span><Icon name="box" /></span><div><strong>Fulfillment confirmed</strong><small>Deadline {selectedOrder.deadline}</small></div></div><div className={`timeline-item ${selectedOrder.status === 'captured' ? 'complete' : ''}`}><span><Icon name="check" /></span><div><strong>Payment captured</strong><small>Merchant settlement</small></div></div></div>{['reserved', 'fulfilled'].includes(selectedOrder.status) && <div className="action-box"><div><strong>{selectedOrder.status === 'reserved' ? 'Ready to fulfill?' : 'Ready to release funds?'}</strong><p>{selectedOrder.status === 'reserved' ? 'Mark the order fulfilled after your store ships it.' : 'Capture the reserved payment after fulfillment.'}</p></div>{selectedOrder.status === 'reserved' ? <button className="primary-button" onClick={() => updateOrderStatus('fulfilled')}>Mark fulfilled <Icon name="arrow" /></button> : <button className="primary-button" onClick={() => updateOrderStatus('captured')}>Capture payment <Icon name="check" /></button>}</div>}{selectedOrder.status === 'captured' && <div className="success-box"><span><Icon name="check" /></span><div><strong>Payment settled</strong><p>Funds were released after fulfillment.</p></div><button onClick={() => updateOrderStatus('refunded')}><Icon name="refund" /> Refund</button></div>}{['reserved', 'fulfilled'].includes(selectedOrder.status) && <button className="text-action" onClick={() => updateOrderStatus('canceled')}><Icon name="close" /> Cancel order and return funds</button>}<div className="detail-footer"><span><Icon name="lock" /> Non-custodial payment state</span><button onClick={() => setNotice('Order receipt copied to clipboard.')}>Copy receipt</button></div></>}</section></div><footer className="footer"><strong>Tender</strong><span>Protected commerce settlement on Tempo</span><a href="https://tempo.xyz" target="_blank" rel="noreferrer">Tempo documentation <Icon name="external" /></a></footer></section> : <section className="checkout-view"><div className="checkout-intro"><p className="eyebrow">TENDER CHECKOUT</p><h1>Pay with confidence.</h1><p>Funds stay reserved until the merchant fulfills your order. This storefront is connected to Tempo Moderato.</p><span className="demo-note"><span className="network-dot" /> Demo store · Tempo testnet</span></div><div className="shop-layout"><div className="product-grid">{products.map((product) => <button key={product.name} className={`product-card ${selectedProduct.name === product.name ? 'chosen' : ''}`} onClick={() => { setSelectedProduct(product); setCheckoutState('idle'); }}><div className={`product-art ${product.color}`}><span>{product.name.split(' ').map((word) => word[0]).slice(0, 2).join('')}</span></div><div className="product-copy"><span className="product-tag">{product.tag}</span><h2>{product.name}</h2><p>{product.description}</p><strong>${product.price} <small>USDC</small></strong></div></button>)}</div><aside className="checkout-card"><div className="checkout-card-head"><span>YOUR ORDER</span><span className="secure"><Icon name="lock" /> Protected</span></div><div className="checkout-product"><div className={`mini-art ${selectedProduct.color}`}>{selectedProduct.name.slice(0, 1)}</div><div><strong>{selectedProduct.name}</strong><small>1 item · Ships in 1–2 days</small></div><b>${selectedProduct.price}</b></div><div className="checkout-total"><span>Total</span><strong>${selectedProduct.price} <small>USDC</small></strong></div><div className="protection-note"><Icon name="lock" /><div><strong>Payment protection included</strong><p>Your funds are reserved until the merchant confirms fulfillment.</p></div></div><button className="checkout-pay" onClick={wallet ? completeCheckout : connectWallet} disabled={checkoutState === 'processing'}>{checkoutState === 'processing' ? 'Reserving payment…' : checkoutState === 'complete' ? 'Order reserved' : wallet ? 'Reserve payment' : 'Connect wallet to pay'} <Icon name={checkoutState === 'complete' ? 'check' : 'arrow'} /></button><small className="checkout-foot">Tempo stablecoin payment · No separate gas token required in this demo</small></aside></div></section>}
    </main>
    {notice && <div className="toast"><span>{notice}</span><button onClick={() => setNotice('')}><Icon name="close" /></button></div>}
    {newOrderOpen && <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setNewOrderOpen(false)}><form className="modal" onSubmit={createOrder}><button type="button" className="modal-close" onClick={() => setNewOrderOpen(false)}><Icon name="close" /></button><p className="eyebrow">NEW ORDER</p><h2>Create a protected order</h2><p className="modal-subtitle">Create an order, then share the checkout link with your customer.</p><label>Customer name<input value={newOrder.customer} onChange={(event) => setNewOrder({ ...newOrder, customer: event.target.value })} placeholder="e.g. Maya Okafor" /></label><label>Customer email<input type="email" value={newOrder.email} onChange={(event) => setNewOrder({ ...newOrder, email: event.target.value })} placeholder="maya@example.com" /></label><label>Product<select value={newOrder.product} onChange={(event) => setNewOrder({ ...newOrder, product: event.target.value })}>{products.map((product) => <option key={product.name}>{product.name}</option>)}</select></label><div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setNewOrderOpen(false)}>Cancel</button><button className="primary-button">Create order <Icon name="arrow" /></button></div></form></div>}
  </div>;
}

export default App;
