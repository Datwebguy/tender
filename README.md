# Tender

Tender is payout operations for Web3 teams that pay external contributors for completed work. A team records the deliverable and evidence, a reviewer approves it, and the payer releases tokens on the network holding its funds. Grants, bounties, and contributor contracts use the same work-to-approval-to-payment flow.

## Current flow

- Create a work item for a grant milestone, bounty, contributor contract, or other deliverable.
- Add the recipient wallet, amount, token contract, token decimals, payout network, and an evidence link.
- Tender reads public GitHub pull-request status. A pull request must be merged before it can be approved. Other evidence links are reviewed by the payer.
- A human reviewer signs off. An injected EVM wallet submits the token transfer on the selected network.
- Tender waits for the transaction receipt and lets the payer share a recipient receipt or download a JSON payout record.

## Supported networks

The current build targets public testnets:

| Network | Chain ID | RPC | Gas token |
| --- | ---: | --- | --- |
| Tempo Moderato | `42431` | `https://rpc.moderato.tempo.xyz` | USD-denominated gas |
| Robinhood Chain Testnet | `46630` | `https://rpc.testnet.chain.robinhood.com` | ETH |

Tempo network details are in [Tempo's developer docs](https://tempo.xyz/developers). Robinhood Chain connection details and its testnet faucet are in the [official developer documentation](https://docs.robinhood.com/chain/connecting/). Tender does not assume a token address: enter a token contract deployed on the selected network and its decimal precision. The recipient and payer need compatible wallets and testnet assets; the Robinhood testnet payer also needs test ETH for gas.

## Run locally

```sh
npm install
npm run dev
```

Create a production bundle with `npm run build`.

## Current limits

- Work records are stored in the browser's local storage. They are not synchronized between team members or devices.
- GitHub status checks work for public pull requests only. A merged PR is an evidence signal, not a judgment of work quality; a human reviewer must approve.
- Non-PR evidence links are not independently verified. The reviewer opens the link and records approval.
- Tender sends a direct token transfer from the connected wallet. It does not custody funds, escrow them, or enforce work agreements on-chain.
- Shared receipt links encode the payout record in the URL. Anyone with the link can view it; do not include confidential information.
- These integrations target testnets. There is no authentication, role management, server-side audit log, production-chain configuration, or audited payout contract yet.
