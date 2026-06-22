'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useParams } from 'next/navigation'

export default function InvoicePage() {
  const { id } = useParams()
  const [sale, setSale] = useState(null)
  const [items, setItems] = useState<any[]>([])

  useEffect(() => {
    fetchInvoice()
  }, [])

  async function fetchInvoice() {
    // get sale
    const { data: saleData } = await supabase
      .from('sales')
      .select('*')
      .eq('id', id)
      .single()

    setSale(saleData)

    // get items
    const { data: itemData } = await supabase
      .from('sale_items')
      .select('*, products(name)')
      .eq('sale_id', id)

    setItems(itemData || [])
  }

  if (!sale) return <p>Loading invoice...</p>

  const total = items.reduce((sum, i) => sum + Number(i.selling_price), 0)

  return (
    <div style={{ padding: 20 }}>
      <h2>🧾 Invoice #{sale.id}</h2>

      <p>Date: {new Date(sale.created_at).toLocaleString()}</p>

      <hr />

      <h3>Items</h3>

      {items.map((i) => (
        <div key={i.id}>
          {i.products?.name} - ${i.selling_price}
        </div>
      ))}

      <hr />

      <h3>Total: ${sale.total_amount}</h3>
    </div>
  )
}