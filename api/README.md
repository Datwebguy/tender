# Tender API

## Product catalog

`GET /api/products` reads active product rows from the `tender_products` table in PostgreSQL. It returns an empty list when the table has no active rows. It returns an error when database configuration or the database request fails; it does not provide sample products.

Populate the table only with the merchant's real catalog data. Each row needs an ID, product name, positive amount, and non-empty token symbol. Description and image URL are optional. The checkout frontend is configured for one token address and symbol, so catalog rows must match that configured token. Amount handling currently assumes six token decimals.

## Orders

`POST /api/orders` accepts a real `productId` from the catalog and a merchant-supplied future fulfillment `deadline`. The API reads the current price and product details from PostgreSQL, creates the order, and returns a random order ID plus a one-time management token. The database stores only a hash of that token. The browser stores the token with the local dashboard copy; losing that browser data prevents the merchant from marking fulfillment through this API.

`GET /api/orders?id=<id>` returns one public order record so a buyer can open a shared checkout link. `PATCH /api/orders` accepts lifecycle updates. Payment reservation and settlement updates are checked against Tempo Moderato receipt and escrow state. Marking fulfillment requires the management-token header. This API does not provide merchant authentication, store-level access control, or a cross-device order listing. Do not put sensitive customer information in the order fields.

## Database setup

Create the Railway PostgreSQL service, configure its TCP proxy on port `5432` for connections from Vercel, and set the resulting PostgreSQL connection string as the server-only `DATABASE_URL` in Vercel. The API requires TLS and uses a single pooled connection per warm function instance. Run `schema.sql` against the database, then insert the merchant's actual catalog records into `tender_products`. Do not prefix `DATABASE_URL` with `VITE_`.

For local development, copy the Railway PostgreSQL connection string to the server variable in `.env.local`:

```env
DATABASE_URL=...
TENDER_ESCROW_ADDRESS=...
TENDER_TEMPO_TOKEN_ADDRESS=...
```

`TENDER_ESCROW_ADDRESS` must point to the deployed contract. `TENDER_TEMPO_TOKEN_ADDRESS` selects the token expected during server-side payment verification; if unset, the API uses the Moderato pathUSD address. Keep server variables out of client bundles.

## Fulfillment webhook

`POST /api/fulfillment` accepts a signed JSON fulfillment event and submits capture on Tempo Moderato. Configure these as server-only variables:

```env
TENDER_WEBHOOK_SECRET=...
TENDER_MERCHANT_PRIVATE_KEY=...
TENDER_MERCHANT_ADDRESS=...
TENDER_ESCROW_ADDRESS=...
```

Send JSON with an `x-tender-signature` header containing `sha256=` followed by the HMAC-SHA256 digest of the exact request body bytes. The configured signer must be authorized by the escrow contract to capture the referenced order. The webhook currently does not verify that the order exists in the database, that it is marked fulfilled, or that the signed event came from a carrier. Do not enable it as an automatic fulfillment integration until those checks and the upstream event source are implemented.

Never expose the webhook private key through a `VITE_` variable or commit it to the repository.
