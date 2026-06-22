'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

export default function RiceControl() {
  const [products, setProducts] = useState<any[]>([])
const [history, setHistory] = useState<any[]>([])
  const [selectedProduct, setSelectedProduct] = useState(null)

  useEffect(() => {
    fetchProducts()
  }, [])

  async function fetchProducts() {
    const { data } = await supabase.from('products').select('*')
    setProducts(data || [])
  }

  async function fetchHistory(productId) {
    const { data } = await supabase
      .from('price_history')
      .select('*')
      .eq('product_id', productId)
      .order('created_at', { ascending: false })

    setHistory(data || [])
    setSelectedProduct(productId)
  }

  return (
    <div style={{ padding: 20 }}>
      <h2>🌾 Rice Control Center</h2>

      {/* PRODUCT LIST */}
      <h3>Rice Products</h3>

      {products.map((p) => (
        <div
          key={p.id}
          style={{
            border: '1px solid gray',
            margin: 10,
            padding: 10,
            cursor: 'pointer'
          }}
          onClick={() => fetchHistory(p.id)}
        >
          <b>{p.name}</b> ({p.weight}kg)<br />
          Price: ${p.price}
        </div>
      ))}

      <hr />

      {/* PRICE HISTORY */}
      <h3>Price History</h3>

      {!selectedProduct && <p>Select a product to view history</p>}

      {history.map((h) => (
        <div key={h.id} style={{ marginBottom: 10 }}>
          ${h.price} | Cost: ${h.cost_price} <br />
          <small>{new Date(h.created_at).toLocaleString()}</small>
        </div>
      ))}
    </div>
  )
}