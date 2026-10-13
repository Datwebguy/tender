import { createAppKit } from '@reown/appkit/react';
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi';
import { defineChain, mainnet } from '@reown/appkit/networks';
import { QueryClient } from '@tanstack/react-query';

export const TEMPO_MODERATO = defineChain({
  id: 42431,
  caipNetworkId: 'eip155:42431',
  chainNamespace: 'eip155',
  name: 'Tempo Moderato',
  nativeCurrency: { name: 'USD', symbol: 'USD', decimals: 6 },
  testnet: true,
  rpcUrls: { default: { http: ['https://rpc.moderato.tempo.xyz'] } },
  blockExplorers: { default: { name: 'Tempo Explorer', url: 'https://explore.testnet.tempo.xyz' } },
});

const projectId = import.meta.env.VITE_REOWN_PROJECT_ID;
if (!projectId) throw new Error('Tender wallet setup is missing VITE_REOWN_PROJECT_ID.');

const metadata = {
  name: 'Tender',
  description: 'Protected commerce checkout on Tempo',
  url: window.location.origin,
  icons: [`${window.location.origin}/icon.svg`],
};

// Ethereum is a connection fallback for wallets that have not added Moderato yet.
// Payment actions remain gated on Tempo's chain ID in App and tempo.js.
const networks = [TEMPO_MODERATO, mainnet];
const customRpcUrls = { 'eip155:42431': [{ url: 'https://rpc.moderato.tempo.xyz' }] };
export const wagmiAdapter = new WagmiAdapter({ networks, projectId, customRpcUrls });
export const queryClient = new QueryClient();

createAppKit({
  adapters: [wagmiAdapter],
  networks,
  customRpcUrls,
  projectId,
  metadata,
  features: { analytics: false, email: false, socials: [], swaps: false, onramp: false },
  allowUnsupportedChain: true,
  enableWallets: true,
  enableInjected: true,
  allWallets: 'SHOW',
  enableMobileFullScreen: true,
  defaultNetwork: TEMPO_MODERATO,
  themeMode: 'light',
  themeVariables: { '--w3m-accent': '#20211f', '--w3m-border-radius-master': '8px' },
});
