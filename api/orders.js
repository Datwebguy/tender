import crypto from 'node:crypto';
import postgres from 'postgres';
import { createPublicClient, defineChain, http, parseUnits, stringToHex } from 'viem';

const PATH_USD = '0x20c0000000000000000000000000000000000000';

const chain = defineChain({
  id: 42431,
  name: 'Tempo Moderato',
  nativeCurrency: { name: 'USD', symbol: 'USD', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc.moderato.tempo.xyz'] } },
});
const escrowAbi = [{
  type: 'function', name: 'orders', stateMutability: 'view',
  inputs: [{ name: '', type: 'bytes32' }],
  outputs: [
    { name: 'buyer', type: 'address' }, { name: 'merchant', type: 'address' }, { name: 'token', type: 'address' },
    { name: 'amount', type: 'uint256' }, { name: 'deadline', type: 'uint64' }, { name: 'released', type: 'bool' }, { name: 'refunded', type: 'bool' },
  ],
}];

let sqlClient;

function db() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not configured.');
  if (!sqlClient) {
    sqlClient = postgres(process.env.DATABASE_URL, {
      ssl: 'require',
      max: 1,
      idle_timeout: 20,
      connect_timeout: 10,
    });
  }
  return sqlClient;
}

function publicOrder(row) {
  if (!row) return null;
  return {
    id: row.id,
    product: row.product,
    description: row.description,
    imageUrl: row.image_url,
    productId: row.product_id,
    amount: row.amount,
    token: row.token,
    status: row.status,
    created: row.created_at,
    deadline: row.deadline,
    tx: row.tx,
    buyer: row.buyer_address,
  };
}

function matchesConfiguredPayment(chainOrder, row) {
  const expectedToken = process.env.TENDER_TEMPO_TOKEN_ADDRESS || process.env.VITE_TEMPO_TOKEN_ADDRESS || PATH_USD;
  const expectedMerchant = process.env.TENDER_MERCHANT_ADDRESS || process.env.VITE_TENDER_MERCHANT_ADDRESS;
  return chainOrder[0] !== '0x0000000000000000000000000000000000000000'
    && chainOrder[2].toLowerCase() === expectedToken.toLowerCase()
    && chainOrder[3] === parseUnits(String(row.amount), 6)
    && chainOrder[4] === BigInt(Math.floor(new Date(row.deadline).getTime() / 1000))
    && (!expectedMerchant || chainOrder[1].toLowerCase() === expectedMerchant.toLowerCase());
}

function fail(res, status, error) {
  return res.status(status).json({ error });
}

export default async function handler(req, res) {
  if (!['GET', 'POST', 'PATCH'].includes(req.method)) return fail(res, 405, 'method_not_allowed');
  if (!process.env.DATABASE_URL) return fail(res, 503, 'order_storage_not_configured');

  try {
    const sql = db();

    if (req.method === 'POST') {
      const productId = String(req.body?.productId || '');
      const [product] = await sql`SELECT id, name, description, amount, token, image_url FROM tender_products WHERE id = ${productId} AND active = TRUE`;
      if (!product) return fail(res, 404, 'product_not_found');
      const requestedAmount = String(req.body?.amount ?? product.amount).trim();
      if (!/^\d+(\.\d{1,2})?$/.test(requestedAmount) || Number(requestedAmount) <= 0 || Number(requestedAmount) > 1000000) return fail(res, 400, 'valid_order_amount_required');
      const deadline = new Date(req.body?.deadline);
      if (!req.body?.deadline || Number.isNaN(deadline.getTime()) || deadline.getTime() <= Date.now()) return fail(res, 400, 'future_fulfillment_deadline_required');
      const id = `TND-${crypto.randomBytes(14).toString('hex')}`;
      const managementToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(managementToken).digest('hex');
      const [row] = await sql`
        INSERT INTO tender_orders (id, product_id, product, description, image_url, amount, token, status, deadline, management_token_hash)
        VALUES (${id}, ${product.id}, ${product.name}, ${product.description}, ${product.image_url}, ${requestedAmount}, ${product.token}, 'pending', ${deadline.toISOString()}, ${tokenHash})
        RETURNING id, product_id, product, description, image_url, amount, token, status, created_at, deadline, tx, buyer_address
      `;
      return res.status(201).json({ order: publicOrder(row), managementToken });
    }

    const id = String(req.query?.id || req.body?.id || '');
    if (req.method === 'GET') {
      if (id) {
        const [row] = await sql`SELECT id, product_id, product, description, image_url, amount, token, status, created_at, deadline, tx, buyer_address FROM tender_orders WHERE id = ${id}`;
        if (!row) return fail(res, 404, 'order_not_found');
        return res.status(200).json({ order: publicOrder(row) });
      }
      return fail(res, 400, 'order_id_required');
    }

    const managementToken = String(req.headers['x-tender-management-token'] || '');
    const tokenHash = crypto.createHash('sha256').update(managementToken).digest('hex');
    const nextStatus = req.body?.status;
    let verifiedBuyer = null;
    if (!id) return fail(res, 400, 'order_id_required');
    if (!['reserved', 'fulfilled', 'captured', 'refunded'].includes(nextStatus)) return fail(res, 400, 'invalid_status');
    if (nextStatus === 'fulfilled' && !managementToken) return fail(res, 401, 'management_token_required');
    if (nextStatus === 'reserved') {
      const escrowAddress = process.env.TENDER_ESCROW_ADDRESS || process.env.VITE_TENDER_ESCROW_ADDRESS;
      const tx = String(req.body?.tx || '');
      if (!escrowAddress || !/^0x[0-9a-fA-F]{64}$/.test(tx)) return fail(res, 400, 'valid_payment_and_escrow_required');
      const [record] = await sql`SELECT id, amount, deadline FROM tender_orders WHERE id = ${id}`;
      if (!record) return fail(res, 404, 'order_not_found');
      const publicClient = createPublicClient({ chain, transport: http() });
      const receipt = await publicClient.getTransactionReceipt({ hash: tx });
      const order = await publicClient.readContract({ address: escrowAddress, abi: escrowAbi, functionName: 'orders', args: [stringToHex(id, { size: 32 })] });
      if (receipt.status !== 'success' || !matchesConfiguredPayment(order, record)) return fail(res, 400, 'payment_not_found_on_tempo');
      verifiedBuyer = order[0];
    }
    if (['captured', 'refunded'].includes(nextStatus)) {
      const escrowAddress = process.env.TENDER_ESCROW_ADDRESS || process.env.VITE_TENDER_ESCROW_ADDRESS;
      const tx = String(req.body?.tx || '');
      if (!escrowAddress || !/^0x[0-9a-fA-F]{64}$/.test(tx)) return fail(res, 400, 'valid_settlement_and_escrow_required');
      const [record] = await sql`SELECT id, amount, deadline FROM tender_orders WHERE id = ${id}`;
      if (!record) return fail(res, 404, 'order_not_found');
      const publicClient = createPublicClient({ chain, transport: http() });
      const receipt = await publicClient.getTransactionReceipt({ hash: tx });
      const order = await publicClient.readContract({ address: escrowAddress, abi: escrowAbi, functionName: 'orders', args: [stringToHex(id, { size: 32 })] });
      const isCapture = nextStatus === 'captured';
      if (receipt.status !== 'success' || !matchesConfiguredPayment(order, record) || (isCapture ? !order[5] : !order[6])) return fail(res, 400, 'settlement_not_found_on_tempo');
    }
    const allowPublicChainUpdate = nextStatus !== 'fulfilled';
    const canReserve = nextStatus === 'reserved';
    const canFulfill = nextStatus === 'fulfilled';
    const canSettle = ['captured', 'refunded'].includes(nextStatus);
    const [row] = await sql`
      UPDATE tender_orders
      SET status = ${nextStatus}, tx = COALESCE(${req.body?.tx || null}, tx), buyer_address = COALESCE(${verifiedBuyer}, buyer_address)
      WHERE id = ${id}
        AND (${allowPublicChainUpdate} OR management_token_hash = ${tokenHash})
        AND ((${canReserve} AND status = 'pending') OR (${canFulfill} AND status = 'reserved') OR (${canSettle} AND status IN ('reserved', 'fulfilled')))
      RETURNING id, product_id, product, description, image_url, amount, token, status, created_at, deadline, tx, buyer_address
    `;
    if (!row) return fail(res, 403, 'invalid_management_token');
    return res.status(200).json({ order: publicOrder(row) });
  } catch (error) {
    console.error('Tender order API request failed.');
    return fail(res, 500, 'order_storage_error');
  }
}
