import { createPublicClient, defineChain, http, parseUnits, formatUnits, isAddress, stringToHex } from 'viem';

export const TEMPO_MODERATO = defineChain({
  id: 42431,
  name: 'Tempo Moderato',
  nativeCurrency: { name: 'USD', symbol: 'USD', decimals: 6 },
  testnet: true,
  rpcUrls: {
    default: { http: ['https://rpc.moderato.tempo.xyz'] },
    public: { http: ['https://rpc.moderato.tempo.xyz'] },
  },
  blockExplorers: { default: { name: 'Tempo Explorer', url: 'https://explore.testnet.tempo.xyz' } },
});

export const PATH_USD = '0x20c0000000000000000000000000000000000000';

const tokenAbi = [
  { type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ type: 'address' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'transfer', stateMutability: 'nonpayable', inputs: [{ type: 'address' }, { type: 'uint256' }], outputs: [{ type: 'bool' }] },
];
export async function readBalance(account, tokenAddress = PATH_USD) {
  const client = createPublicClient({ chain: TEMPO_MODERATO, transport: http() });
  return formatUnits(await client.readContract({ address: tokenAddress, abi: tokenAbi, functionName: 'balanceOf', args: [account] }), 6);
}
export async function fundTestWallet(account) {
  const client = createPublicClient({ chain: TEMPO_MODERATO, transport: http() });
  const hashes = await client.request({ method: 'tempo_fundAddress', params: [account] });
  if (!Array.isArray(hashes) || !hashes.length) throw new Error('The faucet did not return a funding transaction.');
  await Promise.all(hashes.map((hash) => waitForSuccessfulReceipt(client, hash)));
  return hashes;
}
export async function sendPayment({ walletClient, account, recipient, amount, tokenAddress = PATH_USD }) {
  if (!isAddress(recipient) || /^0x0{40}$/i.test(recipient)) throw new Error('Enter a valid recipient wallet address.');
  if (!/^\d+(\.\d{1,6})?$/.test(amount) || parseUnits(amount, 6) <= 0n) throw new Error('Enter a positive amount with up to six decimals.');
  if (await walletClient.getChainId() !== TEMPO_MODERATO.id) throw new Error('Switch your wallet to Tempo Moderato.');
  const client = createPublicClient({ chain: TEMPO_MODERATO, transport: http() });
  const args = [recipient, parseUnits(amount, 6)];
  await client.simulateContract({ account, address: tokenAddress, abi: tokenAbi, functionName: 'transfer', args });
  const hash = await walletClient.writeContract({ account, address: tokenAddress, abi: tokenAbi, functionName: 'transfer', args });
  await waitForSuccessfulReceipt(client, hash);
  return hash;
}

async function waitForSuccessfulReceipt(publicClient, hash) {
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== 'success') throw new Error(`Tempo transaction reverted: ${hash}`);
  return receipt;
}

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

export async function reserveProtectedPayment({ walletClient, account, amount, orderId, deadline, escrowAddress, merchantAddress, tokenAddress = PATH_USD }) {
  if (!walletClient || !account || !escrowAddress || !merchantAddress) throw new Error('Connect a wallet and configure Tender escrow and merchant addresses before paying.');
  const publicClient = createPublicClient({ chain: TEMPO_MODERATO, transport: http() });
  const escrowCode = await publicClient.getBytecode({ address: escrowAddress });
  if (!escrowCode || escrowCode === '0x') throw new Error('The configured Tender escrow address has no contract code on Tempo Moderato.');
  const units = parseUnits(String(amount), 6);
  const orderHash = stringToHex(orderId, { size: 32 });
  const deadlineSeconds = BigInt(deadline);
  const approvalHash = await walletClient.writeContract({ address: tokenAddress, abi: erc20Abi, functionName: 'approve', args: [escrowAddress, units], account });
  await waitForSuccessfulReceipt(publicClient, approvalHash);
  const depositHash = await walletClient.writeContract({ address: escrowAddress, abi: escrowAbi, functionName: 'deposit', args: [tokenAddress, units, orderHash, deadlineSeconds, merchantAddress], account });
  await waitForSuccessfulReceipt(publicClient, depositHash);
  return depositHash;
}

export async function settleProtectedPayment({ walletClient, account, orderId, escrowAddress, merchantAddress, action }) {
  if (!walletClient || !account || !escrowAddress) throw new Error('Connect an authorized wallet before settling this order.');
  const publicClient = createPublicClient({ chain: TEMPO_MODERATO, transport: http() });
  const escrowCode = await publicClient.getBytecode({ address: escrowAddress });
  if (!escrowCode || escrowCode === '0x') throw new Error('The configured Tender escrow address has no contract code on Tempo Moderato.');
  const orderHash = stringToHex(orderId, { size: 32 });
  const hash = action === 'capture'
    ? await walletClient.writeContract({ address: escrowAddress, abi: escrowAbi, functionName: 'capture', args: [orderHash, merchantAddress], account })
    : await walletClient.writeContract({ address: escrowAddress, abi: escrowAbi, functionName: 'refund', args: [orderHash], account });
  await waitForSuccessfulReceipt(publicClient, hash);
  return hash;
}

export async function readEscrowOrder({ orderId, escrowAddress }) {
  if (!escrowAddress) return null;
  const publicClient = createPublicClient({ chain: TEMPO_MODERATO, transport: http() });
  const value = await publicClient.readContract({ address: escrowAddress, abi: orderReadAbi, functionName: 'orders', args: [stringToHex(orderId, { size: 32 })] });
  if (!value || value[0] === '0x0000000000000000000000000000000000000000') return null;
  return { buyer: value[0], merchant: value[1], token: value[2], amount: value[3].toString(), deadline: Number(value[4]), released: value[5], refunded: value[6] };
}
