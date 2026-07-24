export interface Product {
  id: number
  name: string
  price: number
  cost_price: number
  weight: number
  stock: number
  linked_wholesale_id?: number | null
  min_stock_level?: number
  is_archived?: boolean
  bags_needed?: number
  mtd_kg_used?: number
  mtd_bags_used?: number
}

export interface InventoryBatch {
  id: number
  product_id: number
  cost_price: number
  remaining_qty: number
  created_at?: string
}

export interface Customer {
  id: number | string
  name: string
  phone?: string
  location?: string
  owner?: string
  type?: string
  google_map?: string
  created_at?: string
  last_purchase_date?: string
  days_since_last_purchase?: number | null
}

export interface CartItem extends Product {
  product_id: number
  quantity: number | ''
  custom_name: string
  custom_price_riel: number | ''
  isSpecial?: boolean
  isReturnFullBag?: boolean
  bypass_stock?: boolean
  add_loose_kg?: number
  loose_retail_id?: number | null
  sortOrder?: number
  selected_batch_id?: number | null
  db_row_id?: number
}

export type PaymentRow = { id: number, method: string, amount: number | '' };