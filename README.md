# Tender

Tender helps a grant team review a funded milestone, pay its recipient on Tempo, and hand over a closeout record with the GitHub evidence and transaction.

## First cut

- Add a milestone with a recipient wallet, TIP-20 token address, amount, decimals, and public GitHub pull request.
- Read the pull request status from GitHub. Payment stays disabled until GitHub reports it merged and a reviewer checks the approval box.
- Connect an injected EVM wallet, switch to Tempo Moderato, and submit a TIP-20 `transfer` after confirming it in the wallet.
- Wait for the transaction receipt, then share a recipient receipt or download a JSON closeout record.
- Open the shared receipt link to check its transaction against the Tempo RPC.

## Run locally

```sh
npm install
npm run dev
```

Build the static app with `npm run build`.

## Network

The first cut targets Tempo Moderato (chain ID `42431`) at `https://rpc.moderato.tempo.xyz`. The sender supplies the token contract address and token decimals; Tender does not guess which TIP-20 asset a program uses. A compatible injected wallet and testnet funds are required to make a payment.

## Current limits

- Milestone records are stored in the browser's local storage. They are not shared between grant staff or synchronized across devices.
- GitHub checks work with public pull requests only. A merged PR is an evidence signal, not a judgment of milestone quality; a human reviewer must approve.
- Tender sends a direct token transfer from the connected wallet. It does not custody funds, escrow them, or enforce a grant agreement on-chain.
- The share link contains the closeout record in its URL. Anyone with the link can view it; do not put confidential grant information in a record.
- This is a testnet prototype, not a production payment system. There is no authentication, role management, server-side audit log, or production-chain configuration yet.
