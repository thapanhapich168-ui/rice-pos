// lib/walletConstants.ts

// 1. Master List of Exact Payment Names
export const WALLET_NAMES = {
  ABA_RADIANT_KHR: 'ABA Radiant ៛',
  ABA_RADIANT_USD: 'ABA Radiant $',
  ABA_BOTH_KHR: 'ABA Both ៛',
  ABA_BOTH_USD: 'ABA Both $',
  CASH_KHR: 'Cash ៛',
  CASH_USD: 'Cash $',
  CASH_CHEST_KHR: 'Cash Chest ៛',
  CASH_CHEST_USD: 'Cash Chest $',
  RADIANT_AVAILABILITY: 'Radiant Availability ៛',
  
  // Liabilities & External Routing (Used for Dropdowns, not as physical cash wallets)
  MOM_AVAILABILITY: 'Mom Availability', 
  REDUCE_SUPPLIER_DEBT: 'Reduce Supplier Debt',
} as const;

// 2. Strict Page Rules (Which options appear where)

// Tables: sales, retail_sales, invoice_summaries (Money In)
export const POS_DELIVERY_WALLETS = [
  WALLET_NAMES.ABA_RADIANT_KHR,
  WALLET_NAMES.ABA_RADIANT_USD,
  WALLET_NAMES.CASH_CHEST_KHR,
  WALLET_NAMES.CASH_CHEST_USD,
  WALLET_NAMES.RADIANT_AVAILABILITY,
];

// Table: invoice_payments (Customers paying off old debt)
export const INVOICE_PAYMENT_WALLETS = [
  WALLET_NAMES.ABA_RADIANT_KHR,
  WALLET_NAMES.ABA_RADIANT_USD,
  WALLET_NAMES.CASH_CHEST_KHR,
  WALLET_NAMES.CASH_CHEST_USD,
];

// Table: cogs_settlements (Paying suppliers for master stock)
export const COGS_PAYMENT_WALLETS = [
  WALLET_NAMES.RADIANT_AVAILABILITY,
  WALLET_NAMES.MOM_AVAILABILITY, // Deducts from business liability
  WALLET_NAMES.CASH_CHEST_KHR,
  WALLET_NAMES.CASH_CHEST_USD,
  WALLET_NAMES.ABA_RADIANT_KHR,
  WALLET_NAMES.ABA_RADIANT_USD,
];

// Table: expenses (Money leaving for operations)
export const EXPENSE_WALLETS = [
  WALLET_NAMES.CASH_KHR,
  WALLET_NAMES.CASH_USD,
  WALLET_NAMES.ABA_BOTH_KHR,
  WALLET_NAMES.ABA_BOTH_USD,
];

// Table: staff_debt_history (Staff salary advances)
export const STAFF_DEBT_WALLETS = [
  WALLET_NAMES.CASH_KHR,
  WALLET_NAMES.CASH_USD,
  WALLET_NAMES.ABA_BOTH_KHR,
  WALLET_NAMES.ABA_BOTH_USD,
];

// Table: stock_returns (Where does the refund go?)
export const STOCK_RETURN_DESTINATIONS = [
  WALLET_NAMES.REDUCE_SUPPLIER_DEBT,
  WALLET_NAMES.CASH_CHEST_KHR,
  WALLET_NAMES.CASH_CHEST_USD,
  WALLET_NAMES.ABA_RADIANT_KHR,
  WALLET_NAMES.ABA_RADIANT_USD,
];