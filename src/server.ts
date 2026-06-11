import "dotenv/config";
import express from "express";
import path from "path";
import { parseIntent } from "./agent/intentParser.js";
import { checkRules } from "./agent/budgetGuard.js";
import { signTransaction, getWalletAddress, getOnchainBalance } from "./ledger/signer.js";
import { getTreasury, addTransaction, setTreasuryAddress, setOnchainBalance } from "./treasury/state.js";

const app = express();
app.use(express.json());
app.use(express.static(path.join(process.cwd(), "public")));

// Single SSE client (demo — one user at a time)
let sseClient: express.Response | null = null;

function emit(event: string, data: object) {
  if (sseClient) {
    sseClient.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  }
}

function pipelineStep(
  step: string,
  status: "active" | "done" | "error",
  message: string
) {
  emit("pipeline", { step, status, message });
}

// SSE stream
app.get("/stream", (_req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.flushHeaders();

  sseClient = res;
  emit("treasury", getTreasury());

  _req.on("close", () => {
    sseClient = null;
  });
});

// Treasury state
app.get("/treasury", (_req, res) => {
  res.json(getTreasury());
});

// Execute a command
app.post("/execute", async (req, res) => {
  const { command } = req.body as { command: string };
  res.json({ ok: true });

  // Reset pipeline
  emit("reset", {});

  try {
    // Step 1 — Parse intent
    pipelineStep("agent", "active", "Parsing natural language intent...");
    const parsed = await parseIntent(command);

    if (parsed.error || !parsed.intent) {
      pipelineStep("agent", "error", parsed.error ?? "Could not parse intent");
      emit("blocked", { reason: parsed.error });
      return;
    }

    const { intent } = parsed;
    pipelineStep(
      "agent",
      "done",
      `${intent.amount_eth} ETH → ${intent.to_address.slice(0, 6)}...${intent.to_address.slice(-4)} on ${intent.network}`
    );

    // Step 2 — Budget guard
    pipelineStep("guard", "active", "Checking spending rules...");
    const guard = checkRules(intent);

    if (!guard.allowed) {
      pipelineStep("guard", "error", guard.reason);
      emit("blocked", { reason: guard.reason, intent });
      addTransaction({
        ...intent,
        status: "blocked",
        reason: guard.reason,
        timestamp: Date.now(),
      });
      emit("treasury", getTreasury());
      return;
    }

    pipelineStep("guard", "done", "All rules passed");

    // Step 3 — DMK + Device signing
    const result = await signTransaction(intent, (step, message) => {
      if (step === "dmk") {
        pipelineStep("dmk", "active", message);
      } else if (step === "device") {
        pipelineStep("dmk", "done", "Session opened");
        pipelineStep("device", "active", message);
        emit("awaiting", { intent });
      }
    });

    if (result.status === "signed") {
      pipelineStep("device", "done", "Approved on device");
      pipelineStep("signed", "done", result.output);
      emit("signed", { intent, signature: result.output });
      addTransaction({
        ...intent,
        status: "signed",
        signature: result.output,
        timestamp: Date.now(),
      });
      emit("treasury", getTreasury());
    } else if (result.status === "rejected") {
      pipelineStep("device", "error", "Rejected on device");
    } else {
      pipelineStep("device", "error", result.output);
    }
  } catch (err) {
    pipelineStep("agent", "error", String(err));
  }
});

async function refreshBalance(address: string) {
  try {
    const balance = await getOnchainBalance(address);
    setOnchainBalance(balance);
    emit("treasury", getTreasury());
    console.log(`  Balance refreshed: ${balance} ETH`);
  } catch (err) {
    console.error("  Balance fetch failed:", err);
  }
}

async function initWallet() {
  try {
    console.log("  Fetching Speculos wallet address...");
    const address = await getWalletAddress();
    setTreasuryAddress(address);
    console.log(`  Treasury address: ${address}`);
    await refreshBalance(address);
    setInterval(() => refreshBalance(address), 30_000);
  } catch (err) {
    console.error("  Wallet init failed:", err);
    console.log("  Make sure Speculos is running and the Ethereum app is open on the device screen.");
  }
}

const PORT = process.env.PORT ?? 7432;
app.listen(PORT, () => {
  console.log(`\n  AI Treasury Guard running at http://localhost:${PORT}`);
  console.log(`  Make sure Speculos is running at ${process.env.SPECULOS_URL ?? "http://localhost:5001"}\n`);
  initWallet();
});
