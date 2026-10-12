import { getNetwork } from './networks.js';
import { isAddress } from './format.js';

const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

export function toTokenUnits(value, decimals) {
  const places = Number(decimals);
  if (!Number.isInteger(places) || places < 0 || places > 18) throw new Error('Token decimals must be a whole number from 0 to 18.');
  const match = String(value).trim().match(/^(\d+)(?:\.(\d+))?$/);
  if (!match || (match[2] || '').length > places) throw new Error(`Enter an amount with no more than ${places} decimal places.`);
  const scale = 10n ** BigInt(places);
  return BigInt(match[1]) * scale + BigInt((match[2] || '').padEnd(places, '0') || '0');
}
export function transferCalldata(recipient, amount) {
  return `0xa9059cbb${recipient.slice(2).toLowerCase().padStart(64, '0')}${amount.toString(16).padStart(64, '0')}`;
}
export function matchesTokenTransfer(receipt, record) {
  if (!receipt || receipt.status !== '0x1' || !isAddress(record?.token) || !isAddress(record?.recipient)) return false;
  try {
    const expected = toTokenUnits(record.amount, record.decimals);
    const recipientTopic = `0x${record.recipient.slice(2).toLowerCase().padStart(64, '0')}`;
    return (receipt.logs || []).some((log) => log.address?.toLowerCase() === record.token.toLowerCase()
      && log.topics?.[0]?.toLowerCase() === TRANSFER_TOPIC
      && log.topics?.[2]?.toLowerCase() === recipientTopic
      && BigInt(log.data || '0x0') === expected);
  } catch { return false; }
}
export function decodeContractString(value) {
  const hex = value.replace(/^0x/, '');
  const readWord = (offset) => BigInt(`0x${hex.slice(offset, offset + 64)}`);
  try {
    const offset = Number(readWord(0)) * 2;
    if (Number.isSafeInteger(offset) && offset >= 64 && offset + 64 <= hex.length) {
      const length = Number(readWord(offset));
      const start = offset + 64;
      if (Number.isSafeInteger(length) && length >= 0 && start + length * 2 <= hex.length) {
        const bytes = Uint8Array.from(hex.slice(start, start + length * 2).match(/.{2}/g) || [], (byte) => parseInt(byte, 16));
        return new TextDecoder().decode(bytes).replace(/\0+$/, '').trim();
      }
    }
  } catch { /* Try the bytes32 form below. */ }
  const bytes = Uint8Array.from((hex.slice(0, 64).match(/.{2}/g) || []), (byte) => parseInt(byte, 16));
  return new TextDecoder().decode(bytes).replace(/\0+$/, '').trim();
}

async function rpc(networkKey, method, params) {
  const network = getNetwork(networkKey);
  const response = await fetch(network.rpc, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  if (!response.ok) throw new Error(`${network.shortName} RPC returned ${response.status}.`);
  const result = await response.json();
  if (result.error) throw new Error(result.error.message || `${network.shortName} RPC error.`);
  return result.result;
}
export function getNetworkReceipt(hash, networkKey = 'tempo') { return rpc(networkKey, 'eth_getTransactionReceipt', [hash]); }
async function getContractResult(networkKey, to, data) {
  const result = await rpc(networkKey, 'eth_call', [{ to, data }, 'latest']);
  if (!result || result === '0x') throw new Error('Token contract did not return the requested value.');
  return result;
}
export async function getTokenMetadata(networkKey, token) {
  const [symbolResult, decimalsResult] = await Promise.all([
    getContractResult(networkKey, token, '0x95d89b41'),
    getContractResult(networkKey, token, '0x313ce567'),
  ]);
  const decimals = Number(BigInt(decimalsResult));
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 18) throw new Error('This token reports decimals outside Tender’s supported range (0–18).');
  return { symbol: decodeContractString(symbolResult), decimals };
}
export async function simulateTokenTransfer(provider, tx) {
  try {
    const result = await provider.request({ method: 'eth_call', params: [tx, 'latest'] });
    if (/^0x0{64}$/i.test(result || '')) throw new Error('Token returned false for this transfer.');
  } catch (error) {
    const message = error?.message || 'Token transfer simulation failed.';
    if (/PolicyForbids|TIP[\s-]?403|transfer policy/i.test(message)) throw new Error('The Tempo token policy does not allow this payer or recipient to transfer this token.');
    if (/paused|ContractPaused/i.test(message)) throw new Error('This token is paused and cannot be transferred right now.');
    if (/InsufficientBalance/i.test(message)) throw new Error('The connected wallet does not have enough of this token to pay the bounty.');
    if (/insufficient funds/i.test(message)) throw new Error('The wallet reports insufficient funds for the transfer or its network fee.');
    throw new Error(`Token transfer simulation failed: ${message}`);
  }
}
export async function waitForNetworkReceipt(hash, networkKey, attempts = 40) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const receipt = await getNetworkReceipt(hash, networkKey).catch(() => null);
    if (receipt) return receipt;
    await new Promise((resolve) => window.setTimeout(resolve, 3000));
  }
  throw new Error(`${getNetwork(networkKey).shortName} has not confirmed the transaction yet: ${hash}`);
}
export async function switchWalletNetwork(provider, network) {
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
