# Ledger AI Spending Agent

An AI agent that moves ETH — but cannot sign anything without hardware approval.

Every transaction routes through the Ledger Device Management Kit (DMK) and requires explicit confirmation on a Ledger device (or Speculos emulator) before a signature is produced. The agent cannot bypass this. The hardware is the kill switch.

---

## The Problem

AI agents that touch value today sign transactions with software keys — API keys in `.env` files, hot wallets in memory. They are copyable, stealable, and have no enforced limits. If the agent is compromised or misbehaves, there is nothing stopping it from draining a wallet.

## The Solution

This project wires the [Ledger Device Management Kit](https://github.com/LedgerHQ/agent-skills) into an AI spending agent as a mandatory signing layer. The agent can parse intent and check rules in software — but it cannot produce a valid signature without a human reviewing and approving the transaction on Ledger hardware.

```
User: "send 0.02 ETH to 0xABC... on sepolia"
         ↓
   Grok (xAI) — parses intent
         ↓
   Budget Guard — checks rules (max amount, allowed networks)
         ↓
   Ledger DMK — routes transaction to device
         ↓
   Speculos / Physical Device — displays tx for human review
         ↓
   You approve → ECDSA signature (r, s, v) returned
```

---

## Stack

| Layer | Tool |
|-------|------|
| AI Agent | [Grok](https://x.ai) via OpenAI-compatible SDK |
| Hardware Signing | [Ledger DMK](https://github.com/LedgerHQ/agent-skills) + `@ledgerhq/device-signer-kit-ethereum` |
| Device Emulator | [Speculos](https://github.com/LedgerHQ/speculos) |
| Transport | `@ledgerhq/device-transport-kit-speculos` |
| TX Serialization | `ethers` v6 |
| Runtime | Node.js + TypeScript |

---

## Project Structure

```
src/
├── main.ts                    # REPL loop — wires all layers together
├── types.ts                   # Shared interfaces
├── agent/
│   ├── intentParser.ts        # Grok: natural language → structured intent
│   └── budgetGuard.ts         # Rules engine (max amount, network, whitelist)
└── ledger/
    └── signer.ts              # DMK + Speculos transport — hardware signing
config/
└── rules.json                 # Spending rules (edit to customise limits)
apps/
└── app-1.22.1-nanos2.elf      # Ledger Ethereum app binary for Speculos
```

---

## Setup

### Prerequisites

- Node.js >= 20
- Docker (for Speculos)
- A free [xAI API key](https://console.x.ai)

### 1. Clone and install

```bash
git clone https://github.com/YOUR_USERNAME/ledger-ai-agent
cd ledger-ai-agent
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env`:
```
XAI_API_KEY=xai-...
SPECULOS_URL=http://localhost:5001
```

### 3. Get the Ethereum app binary

Download `app-1.22.1-nanos2.elf` from the [app-ethereum releases](https://github.com/LedgerHQ/app-ethereum/releases) and place it in the `apps/` folder.

### 4. Start Speculos

```bash
npm run speculos
```

Open `http://localhost:5001` in your browser — this is the mock Ledger device screen.

### 5. Run the agent

```bash
npm run dev
```

---

## Usage

Type a natural language transfer request:

```
You: send 0.02 ETH to 0x3Ea855E4D6440D937117c776501e7653a770b759 on sepolia
```

The agent will:
1. Parse the intent with Grok
2. Check the request against budget rules
3. Build an EIP-1559 transaction
4. Route it through the DMK to Speculos
5. Display it on the mock device screen
6. Wait for your approval

Once you click **Approve** on the Speculos UI, the terminal receives the hardware signature:

```
[Ledger] ✓ SIGNED
[Ledger] r=0x6f36e6...  s=0x0e2c11...  v=1
```

### Budget rules (`config/rules.json`)

```json
{
  "max_per_tx_eth": 0.05,
  "daily_limit_eth": 0.1,
  "allowed_networks": ["sepolia", "ethereum"],
  "address_whitelist": []
}
```

Requests that exceed the per-tx limit or target an unlisted network are blocked before they ever reach the device.

---

## Why this matters

Software-only agents that sign transactions have no enforced guardrails. Rules written in code can be bypassed — by a bug, a compromised key, or a manipulated prompt. Hardware cannot be bypassed remotely.

The Ledger DMK makes hardware-enforced signing a drop-in primitive for any agent stack. The agent handles intelligence. The device handles control. These are not the same thing and should not be handled by the same layer.

---

## Proof of use

This project uses:
- `@ledgerhq/device-management-kit` — core DMK
- `@ledgerhq/device-transport-kit-speculos` — Speculos HTTP transport
- `@ledgerhq/device-signer-kit-ethereum` — Ethereum signing via APDU

The signing flow ends on a Ledger device (emulated via Speculos). The `r`, `s`, `v` signature is produced by the Ledger Ethereum app, not by software.

---

## License

MIT
