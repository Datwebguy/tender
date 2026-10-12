# Tender

Tender is a commerce checkout and order settlement product for online merchants and their customers, using stablecoins on Tempo. A customer deposits payment into escrow; the merchant manages fulfillment and captures the payment through the order dashboard.

This is the current product direction. Earlier grant, bounty, contributor-payout, and milestone-closeout versions in Git history are superseded. Read [AGENTS.md](AGENTS.md) for project guidance and [HANDOVER.md](HANDOVER.md) for deployment details.

Live app: https://tender-beta-two.vercel.app

## Demo flow

1. Open **Checkout** and select a product.
2. Connect a wallet on Tempo Moderato and reserve the testnet payment.
3. Return to **Orders** and select the new order.
4. Mark it fulfilled, then capture the payment.
5. Try cancellation or refund on an open escrow. The contract cannot refund funds after capture.

The UI supports a live payment path when a Tender escrow contract and merchant wallet are configured. Without those environment values it stays in local demo mode and labels the reservation clearly.

## Product surface

- Merchant order dashboard with payment and fulfillment states.
- Buyer checkout with a protected-payment explanation.
- Reserve, fulfill, capture, cancel, expiry, and refund states.
- Tempo Moderato network context.
- Merchant order creation flow.
- Shareable checkout links generated for each order.
- Chain reconciliation that refreshes live escrow state after reload.
- Optional signed fulfillment webhook at `api/fulfillment.js` for server-side capture.

## Run locally

```sh
npm install
npm run dev
```

Build the production bundle with:

```sh
npm run build
```

## Enable live Moderato payments

1. Use the existing Moderato deployment documented in HANDOVER.md, or deploy `contracts/TenderEscrow.sol` for a separate environment. The merchant settlement address is recorded when each order is deposited.
2. Copy `.env.example` to `.env.local` and set `VITE_TENDER_ESCROW_ADDRESS` and `VITE_TENDER_MERCHANT_ADDRESS`.
3. Start Vite again. Checkout will request a TIP-20 approval, then deposit the order into escrow. Capture and refund use the same contract lifecycle.

The default token is Tempo pathUSD (`0x20c0000000000000000000000000000000000000`). Set `VITE_TEMPO_TOKEN_ADDRESS` if the merchant uses another TIP-20 token.

## Deploy with Vercel

Import this repository into Vercel. Add these server environment variables for `/api/fulfillment`:

```env
TENDER_WEBHOOK_SECRET=
TENDER_MERCHANT_PRIVATE_KEY=
TENDER_MERCHANT_ADDRESS=0xd305405708bd19090a91f174d0c49e39fa262db9
TENDER_ESCROW_ADDRESS=0x92ac3f063a75eed5920e18d0031e2646d939c731
```

Add the client variables separately as Vercel **VITE_** environment variables. Never place the merchant private key in a `VITE_` variable.

## Current limits

- Orders and metadata are stored in browser local storage; there is no shared order database. Checkout URLs alone do not make order metadata available in another browser.
- Live reserve path uses a TIP-20 approval followed by an escrow deposit on Tempo Moderato when configured.
- The included `contracts/TenderEscrow.sol` holds funds until capture or an authorized refund.
- Set `VITE_TENDER_ESCROW_ADDRESS` and `VITE_TENDER_MERCHANT_ADDRESS` in `.env.local` after deploying the contract. `VITE_TEMPO_TOKEN_ADDRESS` defaults to Tempo pathUSD.
- Fulfillment is manually confirmed in the dashboard. The contract does not enforce fulfillment or verify delivery; the buyer or merchant can capture an open escrow. The buyer can refund before capture, and anyone can trigger its refund after the deadline.
- The webhook receiver exists but requires server secrets and an authorized signer to operate.
- Merchant authentication, store plugins, carrier tracking, and a shared database remain to be built.
