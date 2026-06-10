import "dotenv/config";
import * as readline from "readline";
import { parseIntent } from "./agent/intentParser.js";
import { checkRules } from "./agent/budgetGuard.js";
import { signTransaction } from "./ledger/signer.js";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function prompt(question: string): Promise<string> {
  return new Promise((resolve) => rl.question(question, resolve));
}

function printBanner() {
  console.log("\n╔══════════════════════════════════════════════════╗");
  console.log("║         Ledger AI Spending Agent                 ║");
  console.log("║  Every transaction requires hardware approval    ║");
  console.log("╚══════════════════════════════════════════════════╝");
  console.log("  Rules: max 0.05 ETH per tx · Sepolia / Ethereum only");
  console.log("  Mock device UI: http://localhost:5001\n");
  console.log('  Type a transfer request (e.g. "send 0.01 ETH to 0xABC... on sepolia")');
  console.log('  Type "exit" to quit\n');
}

async function run() {
  printBanner();

  while (true) {
    const input = (await prompt("You: ")).trim();

    if (!input) continue;
    if (input.toLowerCase() === "exit") {
      console.log("Goodbye.");
      rl.close();
      break;
    }

    // Step 1 — Parse intent with Claude
    console.log("\n  [Agent] Parsing intent...");
    const parsed = await parseIntent(input);

    if (parsed.error || !parsed.intent) {
      console.log(`  [Agent] Could not parse: ${parsed.error}\n`);
      continue;
    }

    const { intent } = parsed;
    console.log(`  [Agent] Intent: send ${intent.amount_eth} ETH → ${intent.to_address} (${intent.network})`);
    if (intent.memo) console.log(`  [Agent] Memo: ${intent.memo}`);

    // Step 2 — Budget guard
    const guard = checkRules(intent);

    if (!guard.allowed) {
      console.log(`  [Guard] ✗ BLOCKED — ${guard.reason}\n`);
      continue;
    }

    console.log(`  [Guard] ✓ APPROVED — ${guard.reason}`);

    // Step 3 — Hardware signing via Ledger
    const result = await signTransaction(intent);

    if (result.status === "signed") {
      console.log(`  [Ledger] ✓ SIGNED`);
      if (result.txHash) console.log(`  [Ledger] TX Hash: ${result.txHash}`);
      console.log(`  [Ledger] ${result.output}\n`);
    } else if (result.status === "rejected") {
      console.log(`  [Ledger] ✗ REJECTED on device — transaction cancelled\n`);
    } else {
      console.log(`  [Ledger] ✗ ERROR — ${result.output}\n`);
    }
  }
}

run().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
