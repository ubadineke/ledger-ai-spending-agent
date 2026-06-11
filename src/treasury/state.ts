export interface TreasuryTransaction {
  id: string;
  to_address: string;
  amount_eth: number;
  network: string;
  memo: string;
  status: "signed" | "blocked";
  reason?: string;
  signature?: string;
  timestamp: number;
}

export interface TreasuryState {
  address: string | null;
  onchain_balance: number | null;
  spent_today: number;
  transactions: TreasuryTransaction[];
}

const state: TreasuryState = {
  address: null,
  onchain_balance: 3.8642,
  spent_today: 0,
  transactions: [],
};

export function getTreasury(): TreasuryState {
  return { ...state, transactions: [...state.transactions] };
}

export function setTreasuryAddress(address: string): void {
  state.address = address;
}

export function setOnchainBalance(balance: number): void {
  state.onchain_balance = balance;
}

export function addTransaction(tx: Omit<TreasuryTransaction, "id">): void {
  const entry: TreasuryTransaction = {
    ...tx,
    id: Math.random().toString(36).slice(2, 10),
  };

  state.transactions.unshift(entry);

  if (tx.status === "signed") {
    state.spent_today = parseFloat((state.spent_today + tx.amount_eth).toFixed(6));
    if (state.onchain_balance !== null) {
      state.onchain_balance = parseFloat((state.onchain_balance - tx.amount_eth).toFixed(6));
    }
  }
}
