# Tender

Tender is a payout and proof-of-work record for open-source contributors. A Web3 team checks a contributor's public merged GitHub pull request, reviews the work, and pays the contributor on a supported network. The contributor receives a receipt they can verify and save to their own work record.

## The first use case

Pay a bounty for a merged public GitHub pull request. Tender keeps the contribution link, human approval, token payment, and transaction proof together. The contributor can keep the receipt and share it as evidence of completed, paid work.

## Flow

1. A payer creates a bounty entry with the public pull request, the contributor's payout address, amount, and token contract.
2. Tender checks GitHub's public API for merge status, author, and change summary. The payer can open the linked contributor profile.
3. Tender reads the token symbol and decimal precision from the selected chain when the contract supports the standard metadata calls.
4. The payer reviews the contribution and confirms they checked the contributor's payout address. Tender simulates the transfer before asking the wallet to sign; Tempo TIP-403 policy and token balance failures can stop the transfer before submission.
5. Tender checks the chain receipt for a successful `Transfer` event with the expected token contract, recipient, and amount.
6. The payer shares the receipt. The contributor opens it, Tender checks the transaction again, and the contributor can optionally connect a wallet to confirm the recipient address before saving it in **My work record**.

## Networks

The app currently targets testnets:

| Network | Chain ID | RPC | Gas token |
| --- | ---: | --- | --- |
| Tempo Moderato | `42431` | `https://rpc.moderato.tempo.xyz` | USD-denominated gas |
| Robinhood Chain Testnet | `46630` | `https://rpc.testnet.chain.robinhood.com` | ETH |

Tempo's Moderato settings come from the [official Tempo repository](https://github.com/tempoxyz/tempo); read about [TIP-20](https://tempo.xyz/developers/docs/protocol/tip20/overview) and [TIP-403 transfer policies](https://tempo.xyz/developers/docs/protocol/tip403/overview). The [Tempo faucet guide](https://tempo.xyz/developers/docs/quickstart/faucet) supplies testnet funds. Robinhood Chain connection details and its testnet faucet are in [official developer docs](https://docs.robinhood.com/chain/connecting/). The payer supplies the token contract address; Tender reads its symbol and decimals when available. Both parties need compatible EVM wallets; the payer also needs the testnet token and any required gas balance.

## Run locally

```sh
npm install
npm run dev
```

Build the production bundle with `npm run build`. Run the unit tests for the amount, receipt-matching, and share-link helpers with `npm test`.

## Current limits

- This is a testnet MVP. No mainnet payments, production deployment configuration, or audited contract is included.
- Team payouts and contributor records are stored in the current browser's local storage. There is no account, shared workspace, or cross-device sync.
- GitHub verification uses its public API. Private repositories are not supported. A merged PR is evidence of merge status, not proof of quality or wallet ownership; a human reviewer checks the work and confirms the contributor's payout address.
- GitHub author/profile and PR change summary are signals for human review; Tender does not establish GitHub-to-wallet identity.
- The optional wallet check on a receipt compares the connected address with the payout recipient. It requests wallet account access, but does not ask for a signature or submit a transaction.
- Token metadata reads and transfer simulations use the selected network's RPC. Metadata calls are best-effort; the payer can enter decimals manually if the contract does not expose standard metadata.
- The contributor's saved record is a convenience view over receipt links, not a credential or identity service. Receipts can be rechecked against the chain, but the local list itself is editable and browser-bound.
- Receipt links encode the payout record in their URL. Anyone with the link can view it; avoid adding confidential data.
- A sent transfer is saved as **Confirming** as soon as the wallet returns its hash, so closing the tab mid-payment does not lose it; reopen the payout and use **Check confirmation**. Tender also blocks a second payout to the same wallet for the same pull request.
- Receipt links carry only the fields a receipt needs (not the reviewer wallet or internal ids). Receipt fields are untrusted: links and numbers are validated before use, and only the token, recipient, amount, and status are proven by the chain. Title, team name, and date are whatever the link's creator wrote.
- Transfers are sent directly from the payer's wallet. Tender does not hold funds, escrow, schedule, or reverse a transfer.
- Token contracts and decimal precision are entered by the payer and should be checked before payment.
