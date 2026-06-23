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
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', width: '100%', background: '#f8fafc', overflowX: 'hidden' }}>
      
      {/* HEADER TOP OPERATIONS BAR */}
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px 12px 65px', borderBottom: '1px solid #e2e8f0', background: '#ffffff', flexShrink: 0 }}>
        <h1 style={{ fontSize: '20px', fontWeight: 'bold', margin: 0, color: '#111827', fontFamily: 'sans-serif' }}>📊 Business Dashboard</h1>
        
        {/* DATE FILTERS CONTAINER */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', outline: 'none', fontSize: '14px', color: '#0f172a' }}
          />
          <span style={{ color: '#64748b', fontSize: '14px' }}>to</span>
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', outline: 'none', fontSize: '14px', color: '#0f172a' }}
          />
          <button 
            onClick={loadData} 
            style={{ padding: '8px 14px', background: '#b59410', color: 'white', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer', fontSize: '13px', transition: 'background 0.2s' }}
          >
            🔄 Refresh
          </button>
        </div>
      </header>

      {/* SCROLLABLE MAIN CANVAS CONTAINER */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 24px 24px 65px' }}>
        
        {/* KPI METRIC CARDS GRID */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '20px', marginBottom: '32px' }}>
          <Card title="💰 Total Revenue" value={`$${revenue.toFixed(2)}`} color="#1b4d3e" />
          <Card title="📦 Total COGS" value={`$${cogs.toFixed(2)}`} color="#b91c1c" />
          <Card title="📈 Gross Profit" value={`$${profit.toFixed(2)}`} color="#10b981" />
          <Card title="🧾 Total Orders" value={orders.toString()} color="#2563eb" />
        </div>

        {/* RECENT SALES TRANSACTION LISTING PANEL */}
        <div style={{ background: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <h2 style={{ margin: '0 0 16px 0', fontSize: '18px', color: '#0f172a', fontFamily: 'sans-serif', borderBottom: '1px solid #f1f5f9', paddingBottom: '12px' }}>🧾 Recent Sales Register Log</h2>
          
          {filteredSales.length === 0 ? (
            <p style={{ textAlign: 'center', color: '#64748b', padding: '20px', margin: 0 }}>No transaction items match the specified date filter boundaries.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {filteredSales.map((s) => (
                <div 
                  key={s.id} 
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    background: '#f8fafc',
                    padding: '16px',
                    borderRadius: '8px',
                    border: '1px solid #e2e8f0',
                    fontFamily: 'sans-serif'
                  }}
                >
                  <div>
                    <span style={{ fontWeight: 'bold', color: '#0f172a', fontSize: '15px' }}>Sale #{s.id}</span>
                    <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
                      💳 Method: <span style={{ fontWeight: '500', color: '#334155' }}>{s.payment_method || 'N/A'}</span>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 'bold', color: '#1b4d3e', fontSize: '16px' }}>${Number(s.total_amount || 0).toFixed(2)}</div>
                    <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>
                      {new Date(s.created_at).toLocaleString()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  )
}

// -------------------------
// REUSABLE KPI CARD INNER MODULE
// -------------------------
interface CardProps {
  title: string
  value: string
  color?: string
}

function Card({ title, value, color = '#1e293b' }: CardProps) {
  return (
    <div style={{
      background: '#ffffff',
      padding: '20px',
      borderRadius: '12px',
      border: '1px solid #e2e8f0',
      boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
      fontFamily: 'sans-serif'
    }}>
      <h3 style={{ margin: 0, fontSize: '13px', fontWeight: '600', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{title}</h3>
      <h2 style={{ margin: '12px 0 0 0', fontSize: '26px', fontWeight: '700', color: color }}>{value}</h2>
    </div>
  )
}