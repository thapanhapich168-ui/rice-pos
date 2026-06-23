'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

export default function RiceControl() {
  const [products, setProducts] = useState<any[]>([])
  const [history, setHistory] = useState<any[]>([])
  const [selectedProduct, setSelectedProduct] = useState<any>(null)

  useEffect(() => {
    fetchProducts()
  }, [])

  async function fetchProducts() {
    const { data } = await supabase.from('products').select('*')
    setProducts(data || [])
  }

  async function fetchHistory(product: any) {
    const { data } = await supabase
      .from('price_history')
      .select('*')
      .eq('product_id', product.id)
      .order('created_at', { ascending: false })

    setHistory(data || [])
    setSelectedProduct(product)
  }

  const formatRielSymbol = (amountInRiel: number) => {
    return `${new Intl.NumberFormat('en-US').format(Math.round(amountInRiel))} ៛`;
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', width: '100%', background: '#f8fafc', overflowX: 'hidden' }}>
      
      {/* HEADER OPERATIONS ACTION BAR */}
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px 12px 75px', borderBottom: '1px solid #e2e8f0', background: '#ffffff', flexShrink: 0 }}>
        <h1 style={{ fontSize: '20px', fontWeight: 'bold', margin: 0, color: '#4a3b1b', fontFamily: 'sans-serif' }}>🌾 Rice Control Center</h1>
        <button 
          onClick={fetchProducts} 
          style={{ padding: '8px 14px', background: '#b58a3d', color: 'white', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer', fontSize: '13px' }}
        >
          🔄 Sync Products
        </button>
      </header>

      {/* TWO-COLUMN DASHBOARD GRID CANVAS */}
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '24px', padding: '24px 24px 24px 75px', overflowY: 'auto' }}>
        
        {/* LEFT COLUMN: ACTIVE PRODUCTS LIST */}
        <div style={{ background: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '20px', display: 'flex', flexDirection: 'column', maxHeight: '80vh' }}>
          <h2 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: '700', color: '#4a3b1b', textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: '1px solid #f1f5f9', paddingBottom: '12px' }}>
            Rice Products Inventory ({products.length})
          </h2>
          
          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px', paddingRight: '4px' }}>
            {products.map((p) => {
              const isSelected = selectedProduct?.id === p.id;
              return (
                <div
                  key={p.id}
                  onClick={() => fetchHistory(p)}
                  style={{
                    border: '1px solid',
                    borderColor: isSelected ? '#b58a3d' : '#e2e8f0',
                    borderRadius: '8px',
                    padding: '14px',
                    cursor: 'pointer',
                    background: isSelected ? '#fefcf3' : '#ffffff',
                    transition: 'all 0.2s ease',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 'bold', color: '#1e293b', fontSize: '15px' }}>{p.name}</div>
                    <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
                      ⚖️ Package Net Weight: <span style={{ fontWeight: '600', color: '#4a3b1b' }}>{p.weight} kg</span>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 'bold', color: '#b58a3d', fontSize: '15px' }}>{formatRielSymbol(p.price)}</div>
                    <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>Click to view track</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* RIGHT COLUMN: PRICE AUDIT HISTORY LEDGER */}
        <div style={{ background: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '20px', display: 'flex', flexDirection: 'column', maxHeight: '80vh' }}>
          <h2 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: '700', color: '#1b4d3e', textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: '1px solid #f1f5f9', paddingBottom: '12px' }}>
            Price Mutation History
          </h2>

          {!selectedProduct ? (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#64748b', textAlign: 'center', padding: '20px' }}>
              <span style={{ fontSize: '32px', marginBottom: '8px' }}>🔍</span>
              <p style={{ margin: 0, fontSize: '14px' }}>Select an inventory item on the left column to fetch historical pricing updates.</p>
            </div>
          ) : (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              {/* Active Product Header Segment */}
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '12px', marginBottom: '16px' }}>
                <span style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', fontWeight: 'bold' }}>Inspecting Ledger For:</span>
                <div style={{ fontWeight: 'bold', color: '#0f172a', fontSize: '15px', marginTop: '2px' }}>{selectedProduct.name} ({selectedProduct.weight}kg)</div>
              </div>

              {/* History Scroller Stream */}
              <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px', paddingRight: '4px' }}>
                {history.length === 0 ? (
                  <p style={{ textAlign: 'center', color: '#64748b', fontSize: '13px', padding: '20px', margin: 0 }}>No dynamic price variation points recorded for this grain item.</p>
                ) : (
                  history.map((h) => (
                    <div 
                      key={h.id} 
                      style={{
                        background: '#ffffff',
                        padding: '12px 14px',
                        borderRadius: '6px',
                        border: '1px solid #f1f5f9',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        fontFamily: 'sans-serif'
                      }}
                    >
                      <div>
                        <div style={{ fontSize: '14px', fontWeight: '600', color: '#0f172a' }}>
                          Selling: <span style={{ color: '#b58a3d' }}>{formatRielSymbol(h.price)}</span>
                        </div>
                        <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                          Base Cost: {formatRielSymbol(h.cost_price || 0)}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <small style={{ fontSize: '11px', color: '#94a3b8' }}>{new Date(h.created_at).toLocaleString()}</small>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  )
}