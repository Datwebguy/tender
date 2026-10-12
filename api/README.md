# Fulfillment webhook

`POST /api/fulfillment` accepts a signed fulfillment event and captures the matching escrow order on Tempo Moderato.

Required server environment variables:

```env
TENDER_WEBHOOK_SECRET=generate-a-long-random-secret
TENDER_MERCHANT_PRIVATE_KEY=server-only-merchant-key
TENDER_MERCHANT_ADDRESS=0x...
TENDER_ESCROW_ADDRESS=0x...
```

Send the raw JSON body with an `x-tender-signature` header containing `sha256=` plus the HMAC-SHA256 digest of that body. The merchant key must remain server-side; never put it in Vite client variables.
