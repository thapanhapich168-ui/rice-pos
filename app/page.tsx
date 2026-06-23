'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import Link from 'next/link'

export default function HomePage() {
  const [session, setSession] = useState<any>(null)
  const [checkingAuth, setCheckingAuth] = useState(true)
  
  // Login Form States
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  // Live Metrics States
  const [totalProducts, setTotalProducts] = useState(0)
  const [totalSalesCount, setTotalSalesCount] = useState(0)
  const [totalRevenue, setTotalRevenue] = useState(0)
  const [lowStockCount, setLowStockCount] = useState(0)

  useEffect(() => {
    // Check initial login state
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session) loadLiveMetrics()
      setCheckingAuth(false)
    })

    // Listen for real-time login/logout changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      if (session) loadLiveMetrics()
      setCheckingAuth(false)
    })

    return () => subscription.unsubscribe()
  }, [])

  // Fetch real metrics from your Supabase database
  async function loadLiveMetrics() {
    // 1. Get total products and low stock counts
    const { data: products } = await supabase.from('products').select('stock')
    if (products) {
      setTotalProducts(products.length)
      // Count products with stock under 5 items
      const lowStock = products.filter(p => Number(p.stock || 0) < 5).length
      setLowStockCount(lowStock)
    }

    // 2. Get live revenue and total orders from your sales table
    const { data: sales } = await supabase.from('sales').select('total_amount')
    if (sales) {
      setTotalSalesCount(sales.length)
      const revenue = sales.reduce((sum, s) => sum + Number(s.total_amount || 0), 0)
      setTotalRevenue(revenue)
    }
  }

  // Handle Login submission
  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setErrorMsg('')

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      setErrorMsg(error.message)
      setLoading(false)
    }
  }

  if (checkingAuth) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', fontFamily: 'Arial' }}>
        <h3>Loading application...</h3>
      </div>
    )
  }

  // RENDER LOGIN FORM (If not logged in)
  if (!session) {
    return (
      <div style={{
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh', 
        background: '#f3f4f6',
        fontFamily: 'Arial, sans-serif',
        color: '#111'
      }}>
        <div style={{
          background: '#ffffff',
          padding: '40px',
          borderRadius: '12px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
          width: '100%',
          maxWidth: '400px'
        }}>
          <h2 style={{ textAlign: 'center', marginBottom: '10px' }}>🌾 Rice POS</h2>
          <p style={{ textAlign: 'center', color: '#666', marginBottom: '30px' }}>Sign in to manage your business</p>

          {errorMsg && (
            <div style={{ 
              background: '#fee2e2', 
              color: '#b91c1c', 
              padding: '10px', 
              borderRadius: '6px', 
              marginBottom: '20px',
              fontSize: '14px',
              textAlign: 'center'
            }}>
              {errorMsg}
            </div>
          )}

          <form onSubmit={handleLogin}>
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', fontSize: '14px' }}>Email Address</label>
              <input 
                type="email" 
                required
                placeholder="admin@ricepos.com" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={{
                  width: '100%',
                  padding: '12px',
                  borderRadius: '6px',
                  border: '1px solid #ccc',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            <div style={{ marginBottom: '30px' }}>
              <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', fontSize: '14px' }}>Password</label>
              <input 
                type="password" 
                required
                placeholder="••••••••" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={{
                  width: '100%',
                  padding: '12px',
                  borderRadius: '6px',
                  border: '1px solid #ccc',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            <button 
              type="submit" 
              disabled={loading}
              style={{
                width: '100%',
                padding: '12px',
                background: '#111827',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                fontSize: '16px',
                fontWeight: 'bold',
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.7 : 1
              }}
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>
        </div>
      </div>
    )
  }

  // RENDER REAL DASHBOARD (If logged in successfully)
  return (
    <div style={{ display: 'flex', height: '100vh', fontFamily: 'Arial' }}>

      {/* SIDEBAR */}
      <div style={{
        width: 220,
        background: '#111827',
        color: 'white',
        padding: 20,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between'
      }}>
        <div>
          <h2 style={{ marginBottom: 30 }}>🌾 Rice POS</h2>
          <p style={{ marginBottom: 15, fontWeight: 'bold', color: '#38bdf8' }}>📊 Dashboard</p>
          <p style={{ marginBottom: 15 }}>
            <Link href="/pos" style={{ color: 'white', textDecoration: 'none' }}>🛒 POS System</Link>
          </p>
          <p style={{ marginBottom: 15 }}>
            <Link href="/admin" style={{ color: 'white', textDecoration: 'none' }}>📦 Products Admin</Link>
          </p>
          <p style={{ marginBottom: 15 }}>
            <Link href="/dashboard" style={{ color: 'white', textDecoration: 'none' }}>📈 Detailed Reports</Link>
          </p>
          <p style={{ marginBottom: 15 }}>
            <Link href="/rice" style={{ color: 'white', textDecoration: 'none' }}>🌾 Rice Control</Link>
          </p>
        </div>

        <button 
          onClick={() => supabase.auth.signOut()} 
          style={{
            background: '#b91c1c',
            color: 'white',
            border: 'none',
            padding: '10px',
            borderRadius: '6px',
            cursor: 'pointer',
            fontWeight: 'bold'
          }}
        >
          🚪 Log Out
        </button>
      </div>

      {/* MAIN CONTENT */}
      <div style={{
        flex: 1,
        background: '#f3f4f6',
        padding: 20,
        overflowY: 'auto'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h1 style={{ margin: 0, color: '#111' }}>Business Overview</h1>
          <button onClick={loadLiveMetrics} style={{ padding: '8px 16px', borderRadius: 6, cursor: 'pointer', background: '#fff', border: '1px solid #ccc' }}>
            🔄 Refresh Data
          </button>
        </div>

        {/* REAL KPI CARDS */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 20 }}>
          
          <div style={cardStyle}>
            <h3>Total Revenue</h3>
            <h2>${totalRevenue.toFixed(2)}</h2>
          </div>

          <div style={cardStyle}>
            <h3>Total Orders</h3>
            <h2>{totalSalesCount}</h2>
          </div>

          <div style={cardStyle}>
            <h3>Total Items</h3>
            <h2>{totalProducts} products</h2>
          </div>

          <div style={{ ...cardStyle, borderLeft: lowStockCount > 0 ? '5px solid #b91c1c' : 'none' }}>
            <h3>Low Stock Alerts</h3>
            <h2 style={{ color: lowStockCount > 0 ? '#b91c1c' : '#111' }}>{lowStockCount} items</h2>
          </div>

        </div>

        {/* QUICK SHORTCUTS */}
        <div style={{ marginTop: 40, background: '#fff', padding: 25, borderRadius: 10, boxShadow: '0 2px 6px rgba(0,0,0,0.05)' }}>
          <h3 style={{ margin: '0 0 15px 0', color: '#111' }}>Quick Operations</h3>
          <div style={{ display: 'flex', gap: 15 }}>
            <Link href="/pos">
              <button style={{ padding: '12px 24px', background: '#10b981', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 'bold' }}>
                🛒 Open POS Terminal
              </button>
            </Link>
            <Link href="/admin">
              <button style={{ padding: '12px 24px', background: '#4f46e5', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 'bold' }}>
                📦 Manage Inventory Stock
              </button>
            </Link>
          </div>
        </div>

      </div>
    </div>
  )
}

// STYLES
const cardStyle = {
  background: '#ffffff',
  padding: 20,
  borderRadius: 10,
  boxShadow: '0 2px 6px rgba(0,0,0,0.05)',
  color: '#111'
}