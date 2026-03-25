# 🌐 Aggregator

**Aggregator** is a cross-chain dust collection and swapping platform designed to help users consolidate small balances ("dust") from various chains — currently supporting **Stellar**, **StarkNet**, and **Ethereum** (Ethereum support is passive for now).

This MVP allows users to connect their wallets, select token balances across chains, and seamlessly transfer and swap them into a preferred stable currency like **USDC** on **Stellar**.

> ℹ️ **Testnet Setup**: For StarkNet Sepolia testnet, use the [StarkNet Sepolia Faucet](https://faucet.starknet.io) to get testnet ETH. Chain ID: `393402131332719809025n`

---

## 🚀 Features

- 🔗 **Multi-chain support**:
  - ✅ Stellar (Active)
  - ✅ StarkNet (Active)
  - 🕓 Ethereum (Passive only; no logic yet)
- 🧠 **Smart dust collection flow**:
  - Connect your wallet
  - View and select token balances
  - Transfer selected tokens for processing
  - Swap them into **USDC** (or another Stellar currency)
- 💰 **Minimum Threshold**:  
  To maintain efficiency, there's a minimum required amount for processing. Tiny fractions are ignored or bundled as needed for gas optimization.

---

## 🧭 Usage Flow

1. **Connect your wallet**
   - Click the **Connect Wallet** button to link your Stellar or StarkNet wallet.
2. **Select balances**
   - Once connected, available balances are shown. You choose which tokens you want to aggregate.
3. **Process balances**
   - The selected tokens are transferred and bundled for aggregation.

4. **Swap to Stellar currency**
   - After processing, tokens can be swapped into a Stellar-based currency such as **USDC**.
   - You may choose which Stellar currency to receive.

5. **Close transaction**
   - Once swapped, your balances are ready for withdrawal or donation.

---

## 🛠️ Tech Stack

- **Frontend**: Minimal UI with wallet connection and balance selection interface
- **Smart Contracts**:
  - Stellar: Handles transfers and swaps
  - StarkNet: Used for dust balance selection and transfer
  - Ethereum: Currently no active logic, may be supported in future updates

---

## 🧪 Status

This project is an MVP and still under development.  
Active logic is being implemented on **Stellar** and **StarkNet** only for now. Ethereum is passive — no active transfer or swap logic yet.

---

## 🧼 Coming Soon

- Full Ethereum integration
- UI polish and responsiveness
- Donation & withdrawal tracking
- Analytics for token collection impact

---

## 📝 License

MIT License. Use freely and contribute if you'd like.
