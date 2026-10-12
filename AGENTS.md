# Tender project guidance

## Current product

Tender is a commerce checkout and order settlement product for online merchants and their customers, using stablecoins on Tempo.

The intended workflow is: merchant creates an order → buyer pays into Tempo escrow → merchant fulfills → authorized capture settles the payment. Cancellation and refund flows accompany the order lifecycle.

The primary users are merchants managing orders and customers buying goods. The product includes the merchant orders dashboard, buyer checkout, order links, Tempo wallet transactions, and an optional fulfillment webhook.

## Product continuity

- Read this file, README.md, and HANDOVER.md before changing the product or deployment.
- Earlier commits describe grants, bounties, contributor payouts, and milestone closeout. Those are superseded product directions, not the current requirements.
- Commit `4379fe7` restored the commerce product. Commit `cad57b0` and its ancestors contain the earlier direction. Do not select an old commit as a product baseline merely because it builds or was previously deployed.
- Preserve the commerce direction unless the user explicitly requests a product change.
- If a requested reset or deployment would replace commerce with an older product, state that consequence clearly before changing production. Preserve local work before any reset.
- Verify the deployed commit and the served product together. A READY deployment alone does not establish that the correct product is online.

## Implementation facts

- React/Vite frontend; Vercel hosts the frontend and `api/fulfillment.js`.
- Tempo Moderato testnet; deployed contract and environment values are in HANDOVER.md.
- Orders and metadata are stored in browser local storage. A shareable URL alone does not provide shared order storage across browsers.
- Fulfillment confirmation is currently a dashboard action. The contract does not verify shipment, delivery, or fulfillment; an authorized buyer or merchant can capture an open escrow.
- The webhook code exists but requires server secrets and an authorized signer before use.
- Store plugins, carrier tracking, merchant authentication, and a shared database are future work. Do not describe them as operational integrations.
- Private keys must stay outside Git and client environment variables.

## Checks

Run `npm run build` for frontend changes. Review `src/tempo.js` and `contracts/TenderEscrow.sol` before describing payment guarantees. Keep documentation consistent with implemented behavior.
