'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

// ✅ TYPE (IMPORTANT)
type Product = {
  id: number
  name: string
  price: number
  stock: number
  weight: number
}

export default function Admin() {
  const [products, setProducts] = useState<Product[]>([])
  const [name, setName] = useState('')
  const [price, setPrice] = useState('')
  const [stock, setStock] = useState('')
  const [weight, setWeight] = useState('')

  // -------------------------
  // LOAD PRODUCTS
  // -------------------------
  useEffect(() => {
    fetchProducts()
  }, [])

  async function fetchProducts() {
    const { data, error } = await supabase
      .from('products')
      .select('*')

    if (error) {
      console.log(error)
      return
    }

    setProducts(data as Product[])
  }

  // -------------------------
  // ADD PRODUCT
  // -------------------------
  async function addProduct() {
    if (!name || !price || !stock || !weight) {
      alert('Fill all fields')
      return
    }

    const { error } = await supabase.from('products').insert([
      {
        name,
        price: Number(price),
        stock: Number(stock),
        weight: Number(weight),
        cost_price: 0
      }
    ])

    if (error) {
      alert(error.message)
    } else {
      alert('Added!')
      setName('')
      setPrice('')
      setStock('')
      setWeight('')
      fetchProducts()
    }
  }

  // -------------------------
  // DELETE PRODUCT
  // -------------------------
  async function deleteProduct(id: number) {
    await supabase.from('products').delete().eq('id', id)
    fetchProducts()
  }

  // -------------------------
  // UPDATE STOCK
  // -------------------------
  async function updateStock(id: number, newStock: number) {
    await supabase
      .from('products')
      .update({ stock: Number(newStock) })
      .eq('id', id)

    fetchProducts()
  }

  // -------------------------
  // UPDATE PRICE
  // -------------------------
  async function updatePrice(id: number, newPrice: number) {
    await supabase
      .from('products')
      .update({ price: Number(newPrice) })
      .eq('id', id)

    fetchProducts()
  }

  // -------------------------
  // UPDATE WEIGHT
  // -------------------------
  async function updateWeight(id: number, newWeight: number) {
    await supabase
      .from('products')
      .update({ weight: Number(newWeight) })
      .eq('id', id)

    fetchProducts()
  }

  return (
    <div style={{ padding: 20 }}>
      <h2>Admin Panel</h2>

      <h3>Add Product</h3>

      <input
        placeholder="Name"
        value={name}
        onChange={e => setName(e.target.value)}
      />
      <br /><br />

      <input
        placeholder="Price"
        value={price}
        onChange={e => setPrice(e.target.value)}
      />
      <br /><br />

      <input
        placeholder="Stock"
        value={stock}
        onChange={e => setStock(e.target.value)}
      />
      <br /><br />

      <input
        placeholder="Weight (kg)"
        value={weight}
        onChange={e => setWeight(e.target.value)}
      />
      <br /><br />

      <button onClick={addProduct}>Add</button>

      <hr />

      <h3>Product List</h3>

      {products.map((p) => (
        <div
          key={p.id}
          style={{
            border: '1px solid gray',
            margin: 10,
            padding: 10
          }}
        >
          <b>{p.name}</b><br />

          Price:
          <input
            defaultValue={p.price}
            onBlur={(e) => updatePrice(p.id, Number(e.target.value))}
            style={{ marginLeft: 10, width: 80 }}
          />

          <br />

          Stock:
          <input
            defaultValue={p.stock}
            onBlur={(e) => updateStock(p.id, Number(e.target.value))}
            style={{ marginLeft: 10, width: 60 }}
          />

          <br />

          Weight (kg):
          <input
            defaultValue={p.weight}
            onBlur={(e) => updateWeight(p.id, Number(e.target.value))}
            style={{ marginLeft: 10, width: 60 }}
          />

          <br /><br />

          <button onClick={() => deleteProduct(p.id)}>
            Delete
          </button>
        </div>
      ))}
    </div>
  )
}