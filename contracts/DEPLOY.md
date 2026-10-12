# Deploy Tender escrow

TenderEscrow is deployed on Tempo Moderato at `0x92ac3f063a75eed5920e18d0031e2646d939c731`. See `../HANDOVER.md` for the deployment transaction and configured merchant. The steps below are for deploying a separate instance.

## Remix path

1. Open Remix and create `TenderEscrow.sol` from this directory.
2. Compile with Solidity `0.8.24` or a compatible `0.8.x` compiler.
3. In **Deploy & Run**, select **Injected Provider**, switch the wallet to **Tempo Moderato** (`42431`), and deploy `TenderEscrow`.
4. Copy the deployed contract address into `.env.local`:

```env
VITE_TENDER_ESCROW_ADDRESS=0x...
VITE_TENDER_MERCHANT_ADDRESS=0xd305405708bd19090a91f174d0c49e39fa262db9
```

5. Restart Vite. Tender checks the address for contract bytecode before requesting any token approval.

Buyers deposit TIP-20 tokens into the contract; capture sends the recorded amount to the recorded merchant, and refund returns it to the buyer. The buyer or merchant can capture an open order. Fulfillment is an application workflow, not a condition verified by this contract. Refund is available before capture to the buyer, or to any caller after the deadline. There is no contract refund after capture.
