import { createPublicClient, createWalletClient, custom, defineChain, http, parseUnits, stringToHex } from 'viem';

export const TEMPO_MODERATO = defineChain({
  id: 42431,
  name: 'Tempo Moderato',
  nativeCurrency: { name: 'USD', symbol: 'USD', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://rpc.moderato.tempo.xyz'] },
    public: { http: ['https://rpc.moderato.tempo.xyz'] },
  },
  blockExplorers: { default: { name: 'Tempo Explorer', url: 'https://explore.tempo.xyz' } },
});

export const PATH_USD = '0x20c0000000000000000000000000000000000000';

const erc20Abi = [{
  type: 'function', name: 'approve', stateMutability: 'nonpayable',
  inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ type: 'bool' }],
}];

const escrowAbi = [{
  type: 'function', name: 'deposit', stateMutability: 'nonpayable',
  inputs: [
    { name: 'token', type: 'address' },
    { name: 'amount', type: 'uint256' },
    { name: 'orderId', type: 'bytes32' },
    { name: 'deadline', type: 'uint64' },
    { name: 'merchant', type: 'address' },
  ], outputs: [],
}, {
  type: 'function', name: 'capture', stateMutability: 'nonpayable',
  inputs: [{ name: 'orderId', type: 'bytes32' }, { name: 'merchant', type: 'address' }], outputs: [],
}, {
  type: 'function', name: 'refund', stateMutability: 'nonpayable',
  inputs: [{ name: 'orderId', type: 'bytes32' }], outputs: [],
}];

const orderReadAbi = [{
  type: 'function', name: 'orders', stateMutability: 'view',
  inputs: [{ name: '', type: 'bytes32' }],
  outputs: [
    { name: 'buyer', type: 'address' }, { name: 'merchant', type: 'address' }, { name: 'token', type: 'address' },
    { name: 'amount', type: 'uint256' }, { name: 'deadline', type: 'uint64' }, { name: 'released', type: 'bool' }, { name: 'refunded', type: 'bool' },
  ],
}];

export async function reserveProtectedPayment({ provider, account, amount, orderId, deadline, escrowAddress, merchantAddress, tokenAddress = PATH_USD }) {
  if (!provider || !account || !escrowAddress || !merchantAddress) throw new Error('Tender escrow and merchant addresses are not configured for live payments yet.');
  const walletClient = createWalletClient({ account, chain: TEMPO_MODERATO, transport: custom(provider) });
  const publicClient = createPublicClient({ chain: TEMPO_MODERATO, transport: http() });
  const escrowCode = await publicClient.getBytecode({ address: escrowAddress });
  if (!escrowCode || escrowCode === '0x') throw new Error('The configured Tender escrow address has no contract code on Tempo Moderato.');
  const units = parseUnits(String(amount), 6);
  const orderHash = stringToHex(orderId, { size: 32 });
  const deadlineSeconds = BigInt(deadline);
  const approvalHash = await walletClient.writeContract({ address: tokenAddress, abi: erc20Abi, functionName: 'approve', args: [escrowAddress, units], account });
  await publicClient.waitForTransactionReceipt({ hash: approvalHash });
  const depositHash = await walletClient.writeContract({ address: escrowAddress, abi: escrowAbi, functionName: 'deposit', args: [tokenAddress, units, orderHash, deadlineSeconds, merchantAddress], account });
  await publicClient.waitForTransactionReceipt({ hash: depositHash });
  return depositHash;
}

export async function settleProtectedPayment({ provider, account, orderId, escrowAddress, merchantAddress, action }) {
  if (!provider || !account || !escrowAddress) throw new Error('Tender escrow is not configured for live settlement yet.');
  const walletClient = createWalletClient({ account, chain: TEMPO_MODERATO, transport: custom(provider) });
  const publicClient = createPublicClient({ chain: TEMPO_MODERATO, transport: http() });
  const escrowCode = await publicClient.getBytecode({ address: escrowAddress });
  if (!escrowCode || escrowCode === '0x') throw new Error('The configured Tender escrow address has no contract code on Tempo Moderato.');
  const orderHash = stringToHex(orderId, { size: 32 });
  const hash = action === 'capture'
    ? await walletClient.writeContract({ address: escrowAddress, abi: escrowAbi, functionName: 'capture', args: [orderHash, merchantAddress], account })
    : await walletClient.writeContract({ address: escrowAddress, abi: escrowAbi, functionName: 'refund', args: [orderHash], account });
  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}

export async function readEscrowOrder({ orderId, escrowAddress }) {
  if (!escrowAddress) return null;
  const publicClient = createPublicClient({ chain: TEMPO_MODERATO, transport: http() });
  const value = await publicClient.readContract({ address: escrowAddress, abi: orderReadAbi, functionName: 'orders', args: [stringToHex(orderId, { size: 32 })] });
  if (!value || value[0] === '0x0000000000000000000000000000000000000000') return null;
  return { buyer: value[0], merchant: value[1], token: value[2], amount: value[3].toString(), deadline: Number(value[4]), released: value[5], refunded: value[6] };
}
