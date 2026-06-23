'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

// ✅ TYPES
type Product = {
  id: number
  name: string
  price: number
  stock: number
  weight: number
}

type Customer = {
  id: number
  name: string
  phone: string | null
  email: string | null
}

type Expense = {
  id: number
  amount: number
  description: string // Used for Remarks
  expense_date: string
}

export default function Admin() {
  // --- Products State ---
  const [products, setProducts] = useState<Product[]>([])
  const [name, setName] = useState('')
  const [price, setPrice] = useState('')
  const [stock, setStock] = useState('')
  const [weight, setWeight] = useState('')

  // --- Customers State ---
  const [customers, setCustomers] = useState<Customer[]>([])
  const [custName, setCustName] = useState('')
  const [custPhone, setCustPhone] = useState('')
  const [custEmail, setCustEmail] = useState('')

  // --- Expenses State ---
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [expenseAmount, setExpenseAmount] = useState('')
  const [expenseRemarks, setExpenseRemarks] = useState('') // Replaces description

  // -------------------------
  // INITIAL INITIALIZATION
  // -------------------------
  useEffect(() => {
    fetchProducts()
    fetchCustomers()
    fetchExpenses()
  }, [])

  // -------------------------
  // PRODUCT METHODS
  // -------------------------
  async function fetchProducts() {
    const { data, error } = await supabase.from('products').select('*')
    if (error) console.log(error)
    else setProducts((data as Product[]) || [])
  }

  async function addProduct() {
    if (!name || !price || !stock || !weight) {
      alert('Fill all fields')
      return
    }
    const { error } = await supabase.from('products').insert([
      { name, price: Number(price), stock: Number(stock), weight: Number(weight), cost_price: 0 }
    ])
    if (error) alert(error.message)
    else {
      alert('Product Added!')
      setName(''); setPrice(''); setStock(''); setWeight('')
      fetchProducts()
    }
  }

  async function deleteProduct(id: number) {
    await supabase.from('products').delete().eq('id', id)
    fetchProducts()
  }

  async function updateStock(id: number, newStock: any) {
    await supabase.from('products').update({ stock: Number(newStock) }).eq('id', id)
    fetchProducts()
  }

  async function updatePrice(id: number, newPrice: any) {
    await supabase.from('products').update({ price: Number(newPrice) }).eq('id', id)
    fetchProducts()
  }

  async function updateWeight(id: number, newWeight: any) {
    await supabase.from('products').update({ weight: Number(newWeight) }).eq('id', id)
    fetchProducts()
  }

  // -------------------------
  // CUSTOMER METHODS
  // -------------------------
  async function fetchCustomers() {
    const { data, error } = await supabase.from('customers').select('*').order('created_at', { ascending: false })
    if (error) console.log(error)
    else setCustomers((data as Customer[]) || [])
  }

  async function addCustomer() {
    if (!custName) {
      alert('Customer Name is required')
      return
    }
    const { error } = await supabase.from('customers').insert([
      { name: custName, phone: custPhone || null, email: custEmail || null }
    ])
    if (error) alert(error.message)
    else {
      alert('Customer Added!')
      setCustName(''); setCustPhone(''); setCustEmail('')
      fetchCustomers()
    }
  }

  async function deleteCustomer(id: number) {
    if (confirm('Remove this customer?')) {
      const { error } = await supabase.from('customers').delete().eq('id', id)
      if (error) alert(error.message)
      else fetchCustomers()
    }
  }

  // -------------------------
  // EXPENSE METHODS
  // -------------------------
  async function fetchExpenses() {
    const { data, error } = await supabase.from('expenses').select('*').order('expense_date', { ascending: false })
    if (error) console.log(error)
    else setExpenses((data as Expense[]) || [])
  }

  async function addExpense() {
    if (!expenseAmount) {
      alert('Amount is required')
      return
    }
    const { error } = await supabase.from('expenses').insert([
      {
        amount: Number(expenseAmount),
        description: expenseRemarks || 'No remarks' // Saved into description column
      }
    ])
    if (error) alert(error.message)
    else {
      alert('Expense Tracked!')
      setExpenseAmount(''); setExpenseRemarks('')
      fetchExpenses()
    }
  }

  async function deleteExpense(id: number) {
    if (confirm('Delete this expense entry?')) {
      const { error } = await supabase.from('expenses').delete().eq('id', id)
      if (error) alert(error.message)
      else fetchExpenses()
    }
  }

  // --- Common Input Style for Crisp White UI ---
  const inputStyle = {
    display: 'block',
    width: '100%',
    padding: '8px',
    marginBottom: '12px',
    border: '1px solid #ccc',
    borderRadius: '4px',
    boxSizing: 'border-box' as const,
    backgroundColor: '#fff'
  }

  const sectionStyle = {
    backgroundColor: '#fff',
    border: '1px solid #e0e0e0',
    padding: '20px',
    borderRadius: '6px'
  }

  return (
    <div style={{ padding: '30px', fontFamily: 'sans-serif', backgroundColor: '#fff', minHeight: '100vh', color: '#333' }}>
      <h1 style={{ borderBottom: '2px solid #eaeaea', paddingBottom: '10px', marginTop: 0 }}>Admin Dashboard</h1>
      
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '30px', marginTop: '20px' }}>
        
        {/* =========================================
            COLUMN 1: PRODUCTS
           ========================================= */}
        <div style={sectionStyle}>
          <h2 style={{ marginTop: 0 }}>📦 Products</h2>
          
          <div style={{ borderBottom: '1px solid #eee', paddingBottom: '15px', marginBottom: '15px' }}>
            <h4 style={{ margin: '0 0 10px 0' }}>Add Product</h4>
            <input placeholder="Product Name" value={name} onChange={e => setName(e.target.value)} style={inputStyle} />
            <input placeholder="Price" value={price} onChange={e => setPrice(e.target.value)} style={inputStyle} />
            <input placeholder="Stock" value={stock} onChange={e => setStock(e.target.value)} style={inputStyle} />
            <input placeholder="Weight (kg)" value={weight} onChange={e => setWeight(e.target.value)} style={inputStyle} />
            <button onClick={addProduct} style={{ width: '100%', padding: '8px', backgroundColor: '#333', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Add Product</button>
          </div>

          <h3>Product List</h3>
          <div style={{ maxHeight: '500px', overflowY: 'auto' }}>
            {products.map((p) => (
              <div key={p.id} style={{ border: '1px solid #eee', margin: '10px 0', padding: '12px', borderRadius: '4px' }}>
                <b style={{ fontSize: '1.1em' }}>{p.name}</b><br /><br />
                
                <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr', gap: '5px', alignItems: 'center', marginBottom: '5px' }}>
                  <span>Price:</span>
                  <input defaultValue={p.price} onBlur={(e) => updatePrice(p.id, e.target.value)} style={{ padding: '4px', width: '80px' }} />
                  
                  <span>Stock:</span>
                  <input defaultValue={p.stock} onBlur={(e) => updateStock(p.id, e.target.value)} style={{ padding: '4px', width: '60px' }} />
                  
                  <span>Weight:</span>
                  <input defaultValue={p.weight} onBlur={(e) => updateWeight(p.id, e.target.value)} style={{ padding: '4px', width: '60px' }} />
                </div>
                
                <button onClick={() => deleteProduct(p.id)} style={{ color: '#d32f2f', background: 'none', border: 'none', padding: 0, marginTop: '8px', cursor: 'pointer', textDecoration: 'underline' }}>Delete</button>
              </div>
            ))}
          </div>
        </div>

        {/* =========================================
            COLUMN 2: LIVE CUSTOMERS
           ========================================= */}
        <div style={sectionStyle}>
          <h2 style={{ marginTop: 0 }}>👥 Customers</h2>
          
          <div style={{ borderBottom: '1px solid #eee', paddingBottom: '15px', marginBottom: '15px' }}>
            <h4 style={{ margin: '0 0 10px 0' }}>Register Customer</h4>
            <input placeholder="Customer Name *" value={custName} onChange={e => setCustName(e.target.value)} style={inputStyle} />
            <input placeholder="Phone" value={custPhone} onChange={e => setCustPhone(e.target.value)} style={inputStyle} />
            <input placeholder="Email" value={custEmail} onChange={e => setCustEmail(e.target.value)} style={inputStyle} />
            <button onClick={addCustomer} style={{ width: '100%', padding: '8px', backgroundColor: '#333', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Save Customer</button>
          </div>

          <h3>Customer Registry</h3>
          <div style={{ maxHeight: '500px', overflowY: 'auto' }}>
            {customers.length === 0 ? (
              <p style={{ color: '#888', fontStyle: 'italic' }}>No registered profiles.</p>
            ) : (
              customers.map((c) => (
                <div key={c.id} style={{ border: '1px solid #eee', margin: '10px 0', padding: '12px', borderRadius: '4px' }}>
                  <b>{c.name}</b><br />
                  <span style={{ fontSize: '0.9em', color: '#666', display: 'block', marginTop: '4px' }}>
                    📞 {c.phone || 'N/A'} &nbsp;|&nbsp; ✉️ {c.email || 'N/A'}
                  </span>
                  <button onClick={() => deleteCustomer(c.id)} style={{ color: '#d32f2f', background: 'none', border: 'none', padding: 0, marginTop: '8px', cursor: 'pointer', textDecoration: 'underline' }}>Remove Profile</button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* =========================================
            COLUMN 3: EXPENSES
           ========================================= */}
        <div style={sectionStyle}>
          <h2 style={{ marginTop: 0 }}>💸 Expenses</h2>
          
          <div style={{ borderBottom: '1px solid #eee', paddingBottom: '15px', marginBottom: '15px' }}>
            <h4 style={{ margin: '0 0 10px 0' }}>Log Expense</h4>
            
            {/* Amount input sits on top */}
            <input placeholder="Amount ($) *" value={expenseAmount} onChange={e => setExpenseAmount(e.target.value)} type="number" style={inputStyle} />
            
            {/* Remarks input moved directly below Amount */}
            <input placeholder="Remarks / Details" value={expenseRemarks} onChange={e => setExpenseRemarks(e.target.value)} style={inputStyle} />
            
            <button onClick={addExpense} style={{ width: '100%', padding: '8px', backgroundColor: '#333', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Record Expense</button>
          </div>

          <h3>Expense History</h3>
          <div style={{ maxHeight: '500px', overflowY: 'auto' }}>
            {expenses.length === 0 ? (
              <p style={{ color: '#888', fontStyle: 'italic' }}>No logged expenses.</p>
            ) : (
              expenses.map((ex) => (
                <div key={ex.id} style={{ border: '1px solid #eee', margin: '10px 0', padding: '12px', borderRadius: '4px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <b style={{ color: '#d32f2f', fontSize: '1.1em' }}>${Number(ex.amount).toFixed(2)}</b>
                    <span style={{ fontSize: '0.85em', color: '#999' }}>{ex.expense_date}</span>
                  </div>
                  <p style={{ margin: '6px 0 0 0', fontSize: '0.95em', color: '#555' }}>
                    <strong>Remarks:</strong> {ex.description}
                  </p>
                  <button onClick={() => deleteExpense(ex.id)} style={{ color: '#d32f2f', background: 'none', border: 'none', padding: 0, marginTop: '8px', cursor: 'pointer', textDecoration: 'underline' }}>Delete Entry</button>
                </div>
              ))
            )}
          </div>
        </div>

      </div>
    </div>
  )
}