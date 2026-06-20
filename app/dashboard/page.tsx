'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

export default function DashboardPage() {
  const [sales, setSales] = useState<any[]>([])
  const [items, setItems] = useState<any[]>([])

  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')

  // -------------------------
  // LOAD DATA
  // -------------------------
  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    const { data: salesData } = await supabase
      .from('sales')
      .select('*')

    const { data: itemsData } = await supabase
      .from('sale_items')
      .select('*')

    setSales(salesData || [])
    setItems(itemsData || [])
  }

  // -------------------------
  // FILTER BY DATE
  // -------------------------
  function filterByDate(data: any[]) {
    if (!fromDate && !toDate) return data

    return data.filter((item) => {
      const date = item.created_at?.split('T')[0]

      if (fromDate && date < fromDate) return false
      if (toDate && date > toDate) return false

      return true
    })
  }

  const filteredSales = filterByDate(sales)

  const filteredItems = items.filter((item) => {
    const sale = filteredSales.find((s) => s.id === item.sale_id)
    return !!sale
  })

  // -------------------------
  // CALCULATIONS
  // -------------------------

  const revenue = filteredSales.reduce(
    (sum, s) => sum + Number(s.total_amount || 0),
    0
  )

  const cogs = filteredItems.reduce((sum, item) => {
    return sum + Number(item.quantity) * Number(item.cost_price || 0)
  }, 0)

  const profit = revenue - cogs

  const orders = filteredSales.length

  // -------------------------
  // UI
  // -------------------------
  return (
    <div style={{ padding: 20, fontFamily: 'Arial', background: '#f5f5f5', minHeight: '100vh', color: '#111' }}>

      <h1>📊 Business Dashboard</h1>

      {/* DATE FILTER */}
      <div style={{
        display: 'flex',
        gap: 10,
        marginBottom: 20
      }}>
        <input
          type="date"
          value={fromDate}
          onChange={(e) => setFromDate(e.target.value)}
        />

        <input
          type="date"
          value={toDate}
          onChange={(e) => setToDate(e.target.value)}
        />

        <button onClick={loadData} style={{ padding: 8 }}>
          Refresh
        </button>
      </div>

      {/* KPI CARDS */}
      <div style={{
        display: 'flex',
        gap: 20,
        marginBottom: 30
      }}>

        <Card title="💰 Revenue" value={`$${revenue.toFixed(2)}`} />
        <Card title="📦 COGS" value={`$${cogs.toFixed(2)}`} />
        <Card title="📈 Profit" value={`$${profit.toFixed(2)}`} />
        <Card title="🧾 Orders" value={orders} />

      </div>

      {/* SALES LIST */}
      <h2>🧾 Sales List</h2>

      {filteredSales.map((s) => (
        <div key={s.id} style={{
          background: '#fff',
          padding: 12,
          marginBottom: 10,
          borderRadius: 8,
          border: '1px solid #ddd'
        }}>
          <b>Sale #{s.id}</b><br />
          💰 ${s.total_amount}<br />
          💳 {s.payment_method}<br />
          📅 {new Date(s.created_at).toLocaleString()}
        </div>
      ))}

    </div>
  )
}

// -------------------------
// CARD COMPONENT
// -------------------------
function Card({ title, value }: any) {
  return (
    <div style={{
      flex: 1,
      background: '#fff',
      padding: 20,
      borderRadius: 10,
      border: '1px solid #ddd'
    }}>
      <h3 style={{ margin: 0 }}>{title}</h3>
      <h2 style={{ marginTop: 10 }}>{value}</h2>
    </div>
  )
}