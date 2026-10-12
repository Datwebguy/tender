export const NETWORKS = {
  tempo: {
    id: 42431, chainHex: '0xa5bf', name: 'Tempo Moderato', shortName: 'Tempo',
    nativeCurrency: { name: 'USD', symbol: 'USD', decimals: 18 },
    rpc: 'https://rpc.moderato.tempo.xyz', explorer: 'https://explore.tempo.xyz', faucet: 'https://tempo.xyz/developers/docs/quickstart/faucet',
    explorerName: 'Tempo Explorer', testnet: true,
  },
  robinhood: {
    id: 46630, chainHex: '0xb626', name: 'Robinhood Chain Testnet', shortName: 'Robinhood',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpc: 'https://rpc.testnet.chain.robinhood.com', explorer: 'https://explorer.testnet.chain.robinhood.com',
    explorerName: 'Robinhood Explorer', faucet: 'https://faucet.testnet.chain.robinhood.com', testnet: true,
  },
};
export const WORK_TYPES = {
  grant: 'Grant milestone',
  bounty: 'Bounty',
  contract: 'Contributor contract',
  other: 'Other deliverable',
};
export function getNetwork(key) { return NETWORKS[key] || NETWORKS.tempo; }
export function getWorkType(key) { return WORK_TYPES[key] || WORK_TYPES.other; }
