'use client'

import Link from 'next/link'

export default function HomePage() {
  return (
    <div style={{ display: 'flex', height: '100vh', fontFamily: 'Arial' }}>

      {/* SIDEBAR */}
      <div style={{
        width: 220,
        background: '#111827',
        color: 'white',
        padding: 20
      }}>
        <h2 style={{ marginBottom: 30 }}>🌾 Rice POS</h2>

        <p style={{ marginBottom: 15 }}>📊 Dashboard</p>
        <p style={{ marginBottom: 15 }}>
          <Link href="/pos" style={{ color: 'white' }}>
            🛒 POS
          </Link>
        </p>
        <p style={{ marginBottom: 15 }}>📦 Products</p>
        <p style={{ marginBottom: 15 }}>📈 Reports</p>
      </div>

      {/* MAIN CONTENT */}
      <div style={{
        flex: 1,
        background: '#f3f4f6',
        padding: 20,
        overflowY: 'auto'
      }}>

        {/* HEADER */}
        <h1 style={{ marginBottom: 20 }}>Dashboard</h1>

        {/* KPI CARDS */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 20
        }}>

          <div style={cardStyle}>
            <h3>Total Sales</h3>
            <h2>$5,865</h2>
          </div>

          <div style={cardStyle}>
            <h3>Orders</h3>
            <h2>1000</h2>
          </div>

          <div style={cardStyle}>
            <h3>Customers</h3>
            <h2>300</h2>
          </div>

          <div style={cardStyle}>
            <h3>Profit</h3>
            <h2>$2,100</h2>
          </div>

        </div>

        {/* CHART SECTION */}
        <div style={{
          marginTop: 30,
          display: 'grid',
          gridTemplateColumns: '2fr 1fr',
          gap: 20
        }}>

          {/* SALES CHART */}
          <div style={cardStyle}>
            <h3>Sales Overview</h3>
            <div style={{
              height: 200,
              background: '#e5e7eb',
              borderRadius: 6,
              marginTop: 10,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              📈 Chart Coming Soon
            </div>
          </div>

          {/* PIE / ANALYTICS */}
          <div style={cardStyle}>
            <h3>Analytics</h3>
            <div style={{
              height: 200,
              background: '#e5e7eb',
              borderRadius: 6,
              marginTop: 10,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              📊 100%
            </div>
          </div>

        </div>

        {/* QUICK ACTION */}
        <div style={{ marginTop: 30 }}>
          <Link href="/pos">
            <button style={{
              padding: 12,
              background: 'green',
              color: 'white',
              border: 'none',
              borderRadius: 6,
              cursor: 'pointer'
            }}>
              🚀 Go to POS
            </button>
          </Link>
        </div>

      </div>
    </div>
  )
}

// CARD STYLE
const cardStyle = {
  background: '#ffffff',
  padding: 20,
  borderRadius: 10,
  boxShadow: '0 2px 6px rgba(0,0,0,0.05)',
  color: '#111'
}