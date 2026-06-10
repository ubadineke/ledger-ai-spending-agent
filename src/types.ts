export interface TransferIntent {
  to_address: string;
  amount_eth: number;
  network: string;
  memo: string;
}

export interface ParseResult {
  intent?: TransferIntent;
  error?: string;
}

export interface GuardResult {
  allowed: boolean;
  reason: string;
}

export interface SignResult {
  status: "signed" | "rejected" | "error";
  txHash?: string;
  output: string;
}

export interface BudgetRules {
  max_per_tx_eth: number;
  daily_limit_eth: number;
  allowed_networks: string[];
  address_whitelist: string[];
}
