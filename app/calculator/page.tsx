'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabaseClient'

// --- TYPES ---
interface Product {
  id: number
  name: string
  price: number
  cost_price: number
  weight: number
  stock: number
}

interface MixHistory {
  id: string
  time: string
  rice1Name: string
  rice1Ratio: number
  rice2Name: string
  rice2Ratio: number
  mixedCogs: number
}

export default function RiceMixCalculator() {
  const [products, setProducts] = useState<Product[]>([])
  
  // Selection States - Rice 1
  const [rice1Id, setRice1Id] = useState<string>('')
  const [search1, setSearch1] = useState('')
  const [isDropdown1Open, setIsDropdown1Open] = useState(false)
  const [rice1Ratio, setRice1Ratio] = useState<number | ''>('')
  
  // Selection States - Rice 2
  const [rice2Id, setRice2Id] = useState<string>('')
  const [search2, setSearch2] = useState('')
  const [isDropdown2Open, setIsDropdown2Open] = useState(false)
  const [rice2Ratio, setRice2Ratio] = useState<number | ''>('')

  // Results & History
  const [calcResult, setCalcResult] = useState<{ cogs: number, totalRatio: number } | null>(null)
  const [history, setHistory] = useState<MixHistory[]>([])
  
  // Modals
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false)
  const [newMixName, setNewMixName] = useState('')
  const [newMixPrice, setNewMixPrice] = useState<number | ''>('')

  useEffect(() => {
    fetchProducts()
    fetchHistory()
  }, [])

  async function fetchProducts() {
    const { data } = await supabase.from('products').select('*').order('name', { ascending: true })
    if (data) setProducts(data)
  }

  async function fetchHistory() {
    const { data } = await supabase.from('app_settings').select('setting_value').eq('setting_key', 'calculator_history').single()
    if (data && data.setting_value) {
      setHistory(data.setting_value)
    }
  }

  const rice1 = products.find(p => p.id.toString() === rice1Id)
  const rice2 = products.find(p => p.id.toString() === rice2Id)

  const filteredProducts1 = products.filter(p => p.name.toLowerCase().includes(search1.toLowerCase()))
  const filteredProducts2 = products.filter(p => p.name.toLowerCase().includes(search2.toLowerCase()))

  // --- ACTIONS ---
  const handleCalculate = async () => {
    const r1 = Number(rice1Ratio) || 0
    const r2 = Number(rice2Ratio) || 0
    const totalRatio = r1 + r2

    if (!rice1 || !rice2 || totalRatio === 0) {
      alert('Please select both rice products and enter their mixing ratios.')
      return
    }

    // Calculate COGS
    const mixedCogs = ((rice1.cost_price * r1) + (rice2.cost_price * r2)) / totalRatio
    
    // Set UI Result
    setCalcResult({ cogs: mixedCogs, totalRatio })

    // Create History Record
    const newRecord: MixHistory = {
      id: Date.now().toString(),
      time: new Date().toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }),
      rice1Name: rice1.name,
      rice1Ratio: r1,
      rice2Name: rice2.name,
      rice2Ratio: r2,
      mixedCogs: mixedCogs
    }
    
    const updatedHistory = [newRecord, ...history]
    setHistory(updatedHistory)

    // SAVE TO SUPABASE
    await supabase.from('app_settings').upsert({
      setting_key: 'calculator_history',
      setting_value: updatedHistory
    }, { onConflict: 'setting_key' })
  }

  const handleReset = () => {
    setRice1Id('')
    setSearch1('')
    setRice1Ratio('')
    setRice2Id('')
    setSearch2('')
    setRice2Ratio('')
    setCalcResult(null)
  }

  const clearHistory = async () => {
    if (!confirm('Are you sure you want to clear all calculator history?')) return
    setHistory([])
    await supabase.from('app_settings').upsert({
      setting_key: 'calculator_history',
      setting_value: []
    }, { onConflict: 'setting_key' })
  }

  const saveAsNewProduct = async () => {
    if (!newMixName || !newMixPrice || !calcResult) return alert('Please enter a name and selling price for this new mix.')
    
    const payload = {
      name: newMixName,
      price: Number(newMixPrice),
      cost_price: Math.round(calcResult.cogs),
      weight: 50, 
      stock: 0
    }

    const { error } = await supabase.from('products').insert([payload])
    if (!error) {
      alert(`Successfully added "${newMixName}" to your inventory!`)
      setIsSaveModalOpen(false)
      setNewMixName('')
      setNewMixPrice('')
      fetchProducts() 
    } else {
      alert(`Error saving product: ${error.message}`)
    }
  }

  // --- HELPERS ---
  const formatRiel = (amount: number) => `${new Intl.NumberFormat('en-US').format(Math.round(amount))} ៛`

  return (
    <div className="main-wrapper">
      {/* HEADER */}
      <div className="header-container">
        <h1 className="page-title">🧮 Rice Mix Calculator</h1>
        <button className="reset-btn" onClick={handleReset}>↺ Reset Boxes</button>
      </div>

      {/* CALCULATOR WORKSPACE */}
      <div className="calculator-grid">
        
        {/* RICE 1 BOX */}
        <div className="calc-card">
          <h2 className="card-header">Base Rice A</h2>
          <div className="input-group" style={{ position: 'relative' }}>
            <label>Search & Select Rice</label>
            <input 
              type="text"
              placeholder="Search rice A..."
              value={search1}
              onChange={(e) => { setSearch1(e.target.value); setIsDropdown1Open(true); setRice1Id(''); setCalcResult(null); }}
              onFocus={() => setIsDropdown1Open(true)}
              onBlur={() => setTimeout(() => setIsDropdown1Open(false), 200)}
            />
            {isDropdown1Open && (
              <div className="dropdown-menu">
                {filteredProducts1.map(p => (
                  <div key={p.id} className="dropdown-item" onClick={() => { setRice1Id(p.id.toString()); setSearch1(p.name); setIsDropdown1Open(false); }}>
                    {p.name}
                  </div>
                ))}
              </div>
            )}
          </div>
          
          {rice1 && (
            <div className="price-display">
              <div>
                <span className="label">Cost (COGS)</span>
                <span className="value text-gray">{formatRiel(rice1.cost_price)}</span>
              </div>
            </div>
          )}

          <div className="input-group" style={{ marginTop: '16px' }}>
            <label>Mixing Ratio (Parts)</label>
            <input 
              type="number" 
              className="no-spinners ratio-input" 
              value={rice1Ratio} 
              onChange={(e) => { setRice1Ratio(e.target.value === '' ? '' : Number(e.target.value)); setCalcResult(null); }} 
            />
          </div>
        </div>

        {/* PLUS SIGN */}
        <div className="math-symbol">+</div>

        {/* RICE 2 BOX */}
        <div className="calc-card">
          <h2 className="card-header">Base Rice B</h2>
          <div className="input-group" style={{ position: 'relative' }}>
            <label>Search & Select Rice</label>
            <input 
              type="text"
              placeholder="Search rice B..."
              value={search2}
              onChange={(e) => { setSearch2(e.target.value); setIsDropdown2Open(true); setRice2Id(''); setCalcResult(null); }}
              onFocus={() => setIsDropdown2Open(true)}
              onBlur={() => setTimeout(() => setIsDropdown2Open(false), 200)}
            />
            {isDropdown2Open && (
              <div className="dropdown-menu">
                {filteredProducts2.map(p => (
                  <div key={p.id} className="dropdown-item" onClick={() => { setRice2Id(p.id.toString()); setSearch2(p.name); setIsDropdown2Open(false); }}>
                    {p.name}
                  </div>
                ))}
              </div>
            )}
          </div>
          
          {rice2 && (
            <div className="price-display">
              <div>
                <span className="label">Cost (COGS)</span>
                <span className="value text-gray">{formatRiel(rice2.cost_price)}</span>
              </div>
            </div>
          )}

          <div className="input-group" style={{ marginTop: '16px' }}>
            <label>Mixing Ratio (Parts)</label>
            <input 
              type="number" 
              className="no-spinners ratio-input" 
              value={rice2Ratio} 
              onChange={(e) => { setRice2Ratio(e.target.value === '' ? '' : Number(e.target.value)); setCalcResult(null); }} 
            />
          </div>
        </div>

      </div>

      {/* GIANT CALCULATE BUTTON */}
      <div style={{ margin: '30px 0' }}>
        <button className="giant-calc-btn" onClick={handleCalculate}>
          🧮 CALCULATE MIXTURE
        </button>
      </div>

      {/* RESULT PANEL */}
      {calcResult && (
        <div className="result-panel">
          <h2 className="card-header" style={{ marginBottom: '16px' }}>Calculated Mixed Result</h2>
          
          <div className="result-content">
            <div className="result-stats">
              <div className="stat-box">
                <span className="label">Total Ratio</span>
                <span className="value">{calcResult.totalRatio} Parts</span>
              </div>
              <div className="stat-box highlight">
                <span className="label">Mixed COGS (Cost)</span>
                <span className="value text-gold">{formatRiel(calcResult.cogs)}</span>
              </div>
            </div>

            <div className="result-actions">
              <button className="save-product-btn" onClick={() => setIsSaveModalOpen(true)}>💾 Save as New Product</button>
            </div>
          </div>
        </div>
      )}

      {/* HISTORY LOG */}
      <div className="history-section">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3 style={{ color: '#4a3b1b', margin: 0 }}>Calculation History Log</h3>
          {history.length > 0 && (
             <button onClick={clearHistory} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold' }}>Clear History</button>
          )}
        </div>
        
        <div style={{ background: '#fff', borderRadius: '8px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                <th style={{ padding: '12px', color: '#64748b', fontSize: '12px', textTransform: 'uppercase' }}>Time</th>
                <th style={{ padding: '12px', color: '#64748b', fontSize: '12px', textTransform: 'uppercase' }}>Recipe Formula</th>
                <th style={{ padding: '12px', color: '#64748b', fontSize: '12px', textTransform: 'uppercase' }}>Mixed COGS</th>
              </tr>
            </thead>
            <tbody>
              {history.length === 0 ? (
                <tr><td colSpan={3} style={{ padding: '30px', textAlign: 'center', color: '#94a3b8' }}>No calculations logged yet.</td></tr>
              ) : (
                history.map(h => (
                  <tr key={h.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '12px', color: '#94a3b8', fontSize: '14px' }}>{h.time}</td>
                    <td style={{ padding: '12px', fontWeight: 'bold', color: '#1e293b', fontSize: '14px' }}>
                      ({h.rice1Ratio}x {h.rice1Name}) + ({h.rice2Ratio}x {h.rice2Name})
                    </td>
                    <td style={{ padding: '12px', color: '#b58a3d', fontWeight: 'bold', fontSize: '14px' }}>{formatRiel(h.mixedCogs)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* SAVE NEW PRODUCT MODAL */}
      {isSaveModalOpen && calcResult && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h2 style={{ marginTop: 0, color: '#4a3b1b' }}>Save New Mixed Product</h2>
            <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '20px' }}>
              Add this mixture to your database. You must specify a target selling price.
            </p>
            
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#64748b', marginBottom: '4px' }}>New Product Name</label>
            <input 
              placeholder={`e.g. Mix (${rice1Ratio}:${rice2Ratio}) ${rice1?.name.split(' ')[0]}-${rice2?.name.split(' ')[0]}`}
              value={newMixName} 
              onChange={e => setNewMixName(e.target.value)} 
              style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', boxSizing: 'border-box', marginBottom: '16px' }} 
            />

            <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#64748b', marginBottom: '4px' }}>Target Selling Price (៛)</label>
            <input 
              type="number"
              className="no-spinners"
              placeholder="Enter Selling Price..."
              value={newMixPrice} 
              onChange={e => setNewMixPrice(e.target.value === '' ? '' : Number(e.target.value))} 
              style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '2px solid #b58a3d', boxSizing: 'border-box', marginBottom: '20px', fontWeight: 'bold' }} 
            />
            
            <div style={{ marginBottom: '24px', background: '#f8fafc', padding: '12px', borderRadius: '6px' }}>
              <span style={{ fontSize: '11px', color: '#64748b' }}>Calculated COGS (Cost)</span>
              <div style={{ fontWeight: 'bold', color: '#475569' }}>{formatRiel(calcResult.cogs)}</div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button onClick={() => setIsSaveModalOpen(false)} style={{ padding: '10px 16px', background: '#f1f5f9', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', color: '#475569' }}>Cancel</button>
              <button onClick={saveAsNewProduct} style={{ padding: '10px 16px', background: '#10b981', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>Save to Database</button>
            </div>
          </div>
        </div>
      )}

      {/* --- GLOBAL CSS --- */}
      <style jsx global>{`
        input[type="number"].no-spinners::-webkit-inner-spin-button,
        input[type="number"].no-spinners::-webkit-outer-spin-button {
          -webkit-appearance: none;
          margin: 0;
        }
        input[type="number"].no-spinners {
          -moz-appearance: textfield;
        }
        
        .main-wrapper {
          padding: 24px 24px 24px 75px;
          background: #f8fafc;
          min-height: 100vh;
          font-family: Arial, sans-serif;
          color: #333;
          box-sizing: border-box;
        }
        .header-container {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 24px;
        }
        .page-title {
          font-size: 24px;
          font-weight: bold;
          color: #4a3b1b;
          margin: 0;
        }
        .reset-btn {
          padding: 10px 16px;
          background: #e2e8f0;
          color: #475569;
          border: none;
          border-radius: 6px;
          font-weight: bold;
          cursor: pointer;
        }

        .calculator-grid {
          display: flex;
          align-items: center;
          gap: 20px;
        }
        .math-symbol {
          font-size: 32px;
          font-weight: bold;
          color: #cbd5e1;
        }
        .calc-card {
          flex: 1;
          background: #fff;
          padding: 24px;
          border-radius: 12px;
          border: 1px solid #e2e8f0;
          box-shadow: 0 4px 6px rgba(0,0,0,0.02);
        }
        .card-header {
          margin: 0 0 16px 0;
          font-size: 16px;
          color: #4a3b1b;
          text-transform: uppercase;
        }
        .input-group label {
          display: block;
          font-size: 12px;
          font-weight: bold;
          color: #64748b;
          margin-bottom: 6px;
        }
        .input-group input {
          width: 100%;
          padding: 12px;
          border-radius: 6px;
          border: 1px solid #cbd5e1;
          background: #fff;
          font-size: 15px;
          outline: none;
          box-sizing: border-box;
        }
        .input-group input:focus {
          border-color: #b58a3d;
        }
        
        .dropdown-menu {
          position: absolute;
          top: 100%;
          left: 0;
          right: 0;
          background: #fff;
          border: 1px solid #cbd5e1;
          border-radius: 6px;
          margin-top: 4px;
          max-height: 200px;
          overflow-y: auto;
          z-index: 100;
          box-shadow: 0 4px 12px rgba(0,0,0,0.1);
        }
        .dropdown-item {
          padding: 10px 12px;
          cursor: pointer;
          font-size: 14px;
          color: #4a3b1b;
          border-bottom: 1px solid #f3f4f6;
        }
        .dropdown-item:hover {
          background: #f4f1ea;
        }

        .ratio-input {
          font-size: 18px !important;
          font-weight: bold;
          color: #b58a3d !important;
          text-align: center;
          background: #fefcf3 !important;
          border: 2px solid #eadeca !important;
        }
        
        .price-display {
          margin-top: 16px;
          padding: 12px;
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 6px;
        }
        .price-display .label {
          display: block;
          font-size: 11px;
          color: #8a7650;
        }
        .price-display .value {
          font-size: 16px;
          font-weight: bold;
        }
        .text-gold { color: #b58a3d; }
        .text-gray { color: #475569; }

        .giant-calc-btn {
          width: 100%;
          background: #10b981;
          color: white;
          border: none;
          padding: 20px;
          border-radius: 12px;
          font-size: 20px;
          font-weight: bold;
          letter-spacing: 1px;
          cursor: pointer;
          box-shadow: 0 4px 14px rgba(16, 185, 129, 0.4);
          transition: transform 0.1s, box-shadow 0.1s;
        }
        .giant-calc-btn:active {
          transform: scale(0.98);
          box-shadow: 0 2px 8px rgba(16, 185, 129, 0.3);
        }

        .result-panel {
          background: #fff;
          padding: 24px;
          border-radius: 12px;
          border: 2px solid #eadeca;
          margin-bottom: 30px;
        }
        .result-content {
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-wrap: wrap;
          gap: 20px;
        }
        .result-stats {
          display: flex;
          gap: 20px;
        }
        .stat-box {
          padding: 12px 20px;
          background: #f8fafc;
          border-radius: 8px;
          border: 1px solid #e2e8f0;
        }
        .stat-box.highlight {
          background: #fefcf3;
          border-color: #b58a3d;
        }
        .stat-box .label {
          display: block;
          font-size: 12px;
          color: #64748b;
          margin-bottom: 4px;
        }
        .stat-box .value {
          display: block;
          font-size: 20px;
          font-weight: bold;
          color: #1e293b;
        }
        .result-actions {
          display: flex;
          gap: 10px;
        }
        .save-product-btn {
          padding: 12px 20px;
          background: #b58a3d;
          color: #fff;
          border: none;
          border-radius: 6px;
          font-weight: bold;
          cursor: pointer;
        }

        .history-section {
          margin-top: 40px;
        }

        .modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          width: 100vw;
          height: 100vh;
          background: rgba(0,0,0,0.5);
          display: flex;
          justify-content: center;
          align-items: center;
          z-index: 1000;
          padding: 16px;
          box-sizing: border-box;
        }
        .modal-content {
          background: #fff;
          padding: 30px;
          border-radius: 12px;
          width: 100%;
          max-width: 400px;
          box-shadow: 0 10px 25px rgba(0,0,0,0.1);
        }

        @media (max-width: 768px) {
          .main-wrapper {
            padding: 80px 16px 16px 16px;
          }
          .calculator-grid {
            flex-direction: column;
            gap: 10px;
          }
          .math-symbol {
            display: none;
          }
          .result-content {
            flex-direction: column;
            align-items: stretch;
          }
          .result-stats {
            flex-direction: column;
            gap: 10px;
          }
          .result-actions {
            flex-direction: column;
          }
        }
      `}</style>
    </div>
  )
}