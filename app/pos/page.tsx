'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

export default function POSPage() {
  const [products, setProducts] = useState<any[]>([])
  const [cart, setCart] = useState<any[]>([])

  // =========================
  // LOAD PRODUCTS
  // =========================
  useEffect(() => {
    loadProducts()
  }, [])

  async function loadProducts() {
    const { data } = await supabase.from('products').select('*')
    setProducts(data || [])
  }

  // =========================
  // ADD TO CART
  // =========================
  function addToCart(product: any) {
    const existing = cart.find((item) => item.id === product.id)

    if (existing) {
      setCart(
        cart.map((item) =>
          item.id === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        )
      )
    } else {
      setCart([
        ...cart,
        {
          ...product,
          quantity: 1,
          custom_name: product.name
        }
      ])
    }
  }

  // =========================
  // UPDATE CART
  // =========================
  function updateCartItem(id: number, field: string, value: any) {
    setCart(
      cart.map((item) =>
        item.id === id ? { ...item, [field]: value } : item
      )
    )
  }

  // =========================
  // TOTAL
  // =========================
  const total = cart.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0
  )

  // =========================
  // CHECKOUT (STEP 3 + STEP 4 INSIDE)
  // =========================
  async function checkout() {
    if (cart.length === 0) {
      alert('Cart is empty')
      return
    }

    // STEP 3.1: Invoice
    const { data: invoiceNo, error: invoiceError } =
      await supabase.rpc('generate_invoice_no')

    if (invoiceError) {
      alert(invoiceError.message)
      return
    }

    // STEP 3.2: Create sale
    const { data: sale, error } = await supabase
      .from('sales')
      .insert([
        {
          invoice_no: invoiceNo,
          total_amount: total,
          payment_method: 'cash',
          payment_status: 'paid'
        }
      ])
      .select()
      .single()

    if (error) {
      alert(error.message)
      return
    }

    // STEP 3.3: Sale items + stock
    for (const item of cart) {
      await supabase.from('sale_items').insert([
        {
          sale_id: sale.id,
          product_id: item.id,
          quantity: item.quantity,
          selling_price: item.price,
          cost_price: item.cost_price || 0
        }
      ])

      await supabase.rpc('decrease_stock', {
        product_id_input: item.id,
        qty: item.quantity
      })
    }

    // =========================
    // STEP 4: FINISH SYSTEM (CORRECT PLACE)
    // =========================
    alert(`Sale completed successfully! Invoice: ${invoiceNo}`)

    setCart([])
    loadProducts()
  }

  // =========================
  // UI
  // =========================
  return (
    <div style={{ display: 'flex', height: '100vh', fontFamily: 'Arial' }}>

      {/* LEFT */}
      <div style={{
        width: '65%',
        padding: 20,
        overflowY: 'auto',
        background: '#ffffff',
        color: '#111'
      }}>
        <h2>🌾 Products</h2>

        {products.map((p) => (
          <div
            key={p.id}
            onClick={() => addToCart(p)}
            style={{
              border: '1px solid #ddd',
              padding: 12,
              marginBottom: 10,
              cursor: 'pointer',
              background: '#fafafa'
            }}
          >
            <b>{p.name}</b><br />
            💰 ${p.price}<br />
            📦 Stock: {p.stock}<br />
            ⚖️ {p.weight} kg
          </div>
        ))}
      </div>

      {/* RIGHT */}
      <div style={{
        width: '35%',
        padding: 20,
        background: '#f3f4f6',
        color: '#111',
        display: 'flex',
        flexDirection: 'column'
      }}>
        <h2>🛒 Cart</h2>

        <div style={{ flex: 1, overflowY: 'auto' }}>
          {cart.map((item) => (
            <div
              key={item.id}
              style={{
                background: '#fff',
                padding: 10,
                marginBottom: 10,
                border: '1px solid #ddd'
              }}
            >
              <input
                value={item.custom_name}
                onChange={(e) =>
                  updateCartItem(item.id, 'custom_name', e.target.value)
                }
                style={{ width: '100%', marginBottom: 5 }}
              />

              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>${item.price}</span>

                <input
                  type="number"
                  value={item.quantity}
                  onChange={(e) =>
                    updateCartItem(item.id, 'quantity', Number(e.target.value))
                  }
                  style={{ width: 60 }}
                />
              </div>

              <div>
                Subtotal: ${(item.price * item.quantity).toFixed(2)}
              </div>
            </div>
          ))}
        </div>

        {/* TOTAL */}
        <div style={{ borderTop: '1px solid #ccc', paddingTop: 10 }}>
          <h3>Total: ${total.toFixed(2)}</h3>

          <button
            onClick={checkout}
            style={{
              width: '100%',
              padding: 12,
              background: 'green',
              color: 'white',
              border: 'none',
              marginTop: 10
            }}
          >
            Checkout
          </button>
        </div>
      </div>
    </div>
  )
}