# Tender handover

Updated: 12 October 2026

## Live deployment

- Production app: https://tender-beta-two.vercel.app
- GitHub repository: https://github.com/Datwebguy/tender
- Vercel project: `algo-dao-30577dec/tender`
- Production deployment is public and returns HTTP 200.
- Vercel is the current hosting platform. Railway is not required for the current frontend plus serverless API architecture.

## What Tender does

Tender lets a merchant create an order, send the buyer to a shareable checkout link, reserve a Tempo stablecoin payment in escrow, confirm fulfillment, and capture or refund the payment.

## Tempo deployment

- Network: Tempo Moderato
- Chain ID: `42431`
- Escrow contract: `0x92ac3f063a75eed5920e18d0031e2646d939c731`
- Merchant address: `0xd305405708bd19090a91f174d0c49e39fa262db9`
- Default token: `0x20c0000000000000000000000000000000000000`
- Contract deployment transaction: `0x47d31994f4b6ffd5dfd2abf8f94c72ecbc0f0761f171a528cc6996e3bb4a4a59`

## Verified live flow

The deployed contract was exercised with a real testnet payment:

- Token approval: `0x5ddd621b8de673fcf331fe55edac811560d15400e71210861cba77233bf03003`
- Escrow deposit: `0x94892fda52d4eaefaeea2e6fe78164ed2aad813a4f4dc592e280ef092ece8903`
- Capture: `0x9ddcc42637b65d58f8abdc97899646e7b2f70dbe6609fdb4ec79b8c542f9a330`

## Vercel environment variables

Configured for the production frontend:

```env
VITE_TENDER_ESCROW_ADDRESS=0x92ac3f063a75eed5920e18d0031e2646d939c731
VITE_TENDER_MERCHANT_ADDRESS=0xd305405708bd19090a91f174d0c49e39fa262db9
VITE_TEMPO_TOKEN_ADDRESS=0x20c0000000000000000000000000000000000000
```

Do not commit or expose any private key. The buyer/deployer key used for the testnet deployment remains outside the repository.

## Local development

```powershell
cd C:\Users\hflhgjlhjh\tender
npm install
npm run dev
```

Production build check:

```powershell
npm run build
```

## Important files

- `src/App.jsx`: merchant dashboard, checkout, order lifecycle, shareable links, chain polling.
- `src/tempo.js`: Tempo wallet, TIP-20 approval, escrow deposit, capture, refund, and reconciliation.
- `contracts/TenderEscrow.sol`: escrow contract source.
- `api/fulfillment.js`: optional signed fulfillment webhook for server-side capture.
- `vercel.json`: Vite build and Vercel function configuration.

## Remaining work

The optional fulfillment webhook is deployed but not enabled until these server-only variables are configured in Vercel:

```env
TENDER_WEBHOOK_SECRET=<random server secret>
TENDER_MERCHANT_PRIVATE_KEY=<private key for the authorized merchant or buyer signer>
TENDER_ESCROW_ADDRESS=0x92ac3f063a75eed5920e18d0031e2646d939c731
TENDER_MERCHANT_ADDRESS=0xd305405708bd19090a91f174d0c49e39fa262db9
```

The webhook signer must be authorized by the escrow contract. Never put this key in a `VITE_` variable or in GitHub.

Current order records are stored in browser local storage. Production merchant authentication, a database, store plugins, carrier integrations, and automatic fulfillment events are not yet implemented.
