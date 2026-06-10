import fs from "fs";
import path from "path";
import { TransferIntent, GuardResult, BudgetRules } from "../types.js";

const RULES_PATH = path.resolve(process.cwd(), "config/rules.json");

function loadRules(): BudgetRules {
  const raw = fs.readFileSync(RULES_PATH, "utf-8");
  return JSON.parse(raw);
}

export function checkRules(intent: TransferIntent): GuardResult {
  const rules = loadRules();

  if (intent.amount_eth <= 0) {
    return { allowed: false, reason: "Amount must be greater than 0" };
  }

  if (intent.amount_eth > rules.max_per_tx_eth) {
    return {
      allowed: false,
      reason: `Amount ${intent.amount_eth} ETH exceeds per-tx max of ${rules.max_per_tx_eth} ETH`,
    };
  }

  if (!rules.allowed_networks.includes(intent.network)) {
    return {
      allowed: false,
      reason: `Network "${intent.network}" is not in the allowed list: ${rules.allowed_networks.join(", ")}`,
    };
  }

  if (
    rules.address_whitelist.length > 0 &&
    !rules.address_whitelist.includes(intent.to_address.toLowerCase())
  ) {
    return {
      allowed: false,
      reason: `Address ${intent.to_address} is not in the whitelist`,
    };
  }

  return { allowed: true, reason: "All checks passed" };
}
