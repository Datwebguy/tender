# Deploy Tender escrow

The address currently in `.env.local` is an externally owned account, not a contract. Deploy `TenderEscrow.sol` before enabling live checkout.

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

The deployer does not receive custody of deposits. Buyers deposit TIP-20 tokens into the contract; capture sends the recorded amount to the recorded merchant, and refund returns it to the buyer.
