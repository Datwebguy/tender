# Tender

Tender is a payout and proof-of-work record for open-source contributors. A Web3 team checks a contributor's public merged GitHub pull request, reviews the work, and pays the contributor on a supported network. The contributor receives a receipt they can verify and save to their own work record.

## The first use case

Pay a bounty for a merged public GitHub pull request. Tender keeps the contribution link, human approval, token payment, and transaction proof together. The contributor can keep the receipt and share it as evidence of completed, paid work.

## Flow

1. A payer creates a bounty entry with the public pull request, the contributor's payout address, amount, and token contract.
2. Tender checks GitHub's public API and requires the pull request to be merged.
3. The payer reviews the work and confirms the transfer in their wallet.
4. Tender checks the chain receipt for a successful ERC-20 `Transfer` event with the expected token contract, recipient, and amount.
5. The payer shares the receipt. The contributor opens it, Tender checks the transaction again, and the contributor can save it in **My work record**.

## Networks

The app currently targets testnets:

| Network | Chain ID | RPC | Gas token |
| --- | ---: | --- | --- |
| Tempo Moderato | `42431` | `https://rpc.moderato.tempo.xyz` | USD-denominated gas |
| Robinhood Chain Testnet | `46630` | `https://rpc.testnet.chain.robinhood.com` | ETH |

Tempo network details are in [Tempo's developer docs](https://tempo.xyz/developers). Robinhood Chain connection details and its testnet faucet are in [official developer docs](https://docs.robinhood.com/chain/connecting/). The payer supplies the token contract address and decimals. Both parties need compatible EVM wallets; the payer also needs the testnet token and any required gas balance.

## Run locally

```sh
npm install
npm run dev
```

Build the production bundle with `npm run build`.

## Current limits

- This is a testnet MVP. No mainnet payments, production deployment configuration, or audited contract is included.
- Team payouts and contributor records are stored in the current browser's local storage. There is no account, shared workspace, or cross-device sync.
- GitHub verification uses its public API. Private repositories are not supported. A merged PR is evidence of merge status, not proof of quality or wallet ownership; a human reviewer checks the work and confirms the contributor's payout address.
- The contributor's saved record is a convenience view over receipt links, not a credential or identity service. Receipts can be rechecked against the chain, but the local list itself is editable and browser-bound.
- Receipt links encode the payout record in their URL. Anyone with the link can view it; avoid adding confidential data.
- Transfers are sent directly from the payer's wallet. Tender does not hold funds, escrow, schedule, or reverse a transfer.
- Token contracts and decimal precision are entered by the payer and should be checked before payment.
